from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from ultralytics import YOLO
import cv2
import base64
import json
from pydantic import BaseModel
from typing import List, Optional
import os
from fastapi.middleware.cors import CORSMiddleware
import sendgrid
from sendgrid.helpers.mail import Mail, Email, To, Content
from datetime import datetime, timedelta

# Add these new models
class ActionSettings(BaseModel):
    sendEmail: bool
    sendMessage: bool
    emailAddress: Optional[str] = None
    emailSubject: Optional[str] = None
    emailMessage: Optional[str] = None
    phoneNumber: Optional[str] = None
    smsMessage: Optional[str] = None

class DetectionRule(BaseModel):
    id: str
    detectionClass: str
    threshold: float
    actions: ActionSettings

# Path for storing rules
RULES_FILE = "detection_rules.json"

app = FastAPI()

# Remove the existing CORS middleware function and add this configuration instead
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Your frontend origin
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Load existing rules
def load_rules() -> List[DetectionRule]:
    if os.path.exists(RULES_FILE):
        with open(RULES_FILE, 'r') as f:
            rules_data = json.load(f)
            return [DetectionRule(**rule) for rule in rules_data]
    return []

# Save rules to file
def save_rules(rules: List[DetectionRule]):
    with open(RULES_FILE, 'w') as f:
        json.dump([rule.dict() for rule in rules], f, indent=2)

# Add these new endpoints
@app.get("/rules")
def get_rules():
    rules = load_rules()
    return JSONResponse(content=[rule.dict() for rule in rules])

@app.post("/rules")
async def save_rule(rule: DetectionRule):
    rules = load_rules()
    
    # Update existing rule or add new one
    existing_rule_index = next((i for i, r in enumerate(rules) if r.id == rule.id), None)
    if existing_rule_index is not None:
        rules[existing_rule_index] = rule
    else:
        rules.append(rule)
    
    save_rules(rules)
    return JSONResponse(content={"message": "Rule saved successfully"})

@app.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str):
    rules = load_rules()
    rules = [r for r in rules if r.id != rule_id]
    save_rules(rules)
    return JSONResponse(content={"message": "Rule deleted successfully"})

# Load YOLOv8 model
model = YOLO("yolov8n.pt")

# OpenCV Video Capture (use webcam)
video_capture = cv2.VideoCapture(0)

# Initialize SendGrid client
sg = sendgrid.SendGridAPIClient(api_key=os.environ.get('SENDGRID_API_KEY'))

# Add this class to track when emails were last sent
class EmailTracker:
    def __init__(self):
        self.last_sent = {}  # Dictionary to track last email sent time for each rule
        
    def can_send_email(self, rule_id: str, cooldown_minutes: int = 5) -> bool:
        if rule_id not in self.last_sent:
            return True
        
        time_diff = datetime.now() - self.last_sent[rule_id]
        return time_diff > timedelta(minutes=cooldown_minutes)
    
    def update_last_sent(self, rule_id: str):
        self.last_sent[rule_id] = datetime.now()

# Create an instance of EmailTracker
email_tracker = EmailTracker()

# Add this function to handle email sending
def send_email(to_email: str, subject: str, content: str):
    try:
        from_email = Email(os.environ.get('SENDGRID_FROM_EMAIL', 'your-verified-sender@example.com'))
        to_email = To(to_email)
        content = Content("text/plain", content)
        mail = Mail(from_email, to_email, subject, content)
        
        # Get a JSON-ready representation of the Mail object
        mail_json = mail.get()
        
        # Send an HTTP POST request to /mail/send
        response = sg.client.mail.send.post(request_body=mail_json)
        
        print(f"Email sent successfully with status code: {response.status_code}")
        return True
    except Exception as e:
        print(f"Error sending email: {str(e)}")
        return False

def generate_frames_with_data():
    while True:
        success, frame = video_capture.read()
        if not success:
            break

        # Run YOLO model on the frame
        results = model(frame, stream=True)

        # Load current rules
        rules = load_rules()
        
        # Prepare detection data
        detections = []
        person_count = 0
        
        # Track detected classes and their confidences
        detected_classes = {}

        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = model.names[class_id]

                if confidence > 0.5:
                    if class_name == "person":
                        person_count += 1

                    detections.append({
                        "class": class_name,
                        "confidence": round(confidence, 2),
                        "bbox": [x1, y1, x2, y2]
                    })
                    
                    # Track the highest confidence for each class
                    if class_name not in detected_classes or confidence > detected_classes[class_name]:
                        detected_classes[class_name] = confidence

                    # Draw bounding boxes
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(
                        frame,
                        f"{class_name}: {confidence:.2f}",
                        (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 255, 0),
                        2,
                    )

        # Check rules and send notifications
        for rule in rules:
            if rule.detectionClass in detected_classes:
                confidence = detected_classes[rule.detectionClass]
                if confidence >= rule.threshold:
                    # Handle email notification
                    if rule.actions.sendEmail and email_tracker.can_send_email(rule.id):
                        if rule.actions.emailAddress and rule.actions.emailSubject and rule.actions.emailMessage:
                            if send_email(
                                rule.actions.emailAddress,
                                rule.actions.emailSubject,
                                rule.actions.emailMessage
                            ):
                                email_tracker.update_last_sent(rule.id)

        # Encode and send frame data
        _, buffer = cv2.imencode(".jpg", frame)
        frame_bytes = buffer.tobytes()
        image_base64 = base64.b64encode(frame_bytes).decode('utf-8')

        frame_data = {
            "image": image_base64,
            "person_count": person_count,
            "detections": detections
        }

        yield f"data: {json.dumps(frame_data)}\n\n"

@app.get("/stream")
def stream_video_with_data():
    return StreamingResponse(
        generate_frames_with_data(), media_type="text/event-stream"
    )
