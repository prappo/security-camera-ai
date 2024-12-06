from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from ultralytics import YOLO
import cv2
import base64
import json
from pydantic import BaseModel
from typing import List, Optional
import os

# Add these new models
class ActionSettings(BaseModel):
    sendEmail: bool
    sendMessage: bool
    emailAddress: Optional[str] = None
    phoneNumber: Optional[str] = None

class DetectionRule(BaseModel):
    id: str
    detectionClass: str
    threshold: float
    actions: ActionSettings

# Path for storing rules
RULES_FILE = "detection_rules.json"

app = FastAPI()
# Enable CORS
@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

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

# Enable CORS
@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

# Load YOLOv8 model
model = YOLO("yolov8n.pt")

# OpenCV Video Capture (use webcam)
video_capture = cv2.VideoCapture(0)


def generate_frames_with_data():
    while True:
        success, frame = video_capture.read()
        if not success:
            break

        # Run YOLO model on the frame
        results = model(frame, stream=True)

        # Prepare detection data
        detections = []
        person_count = 0

        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = model.names[class_id]

                if confidence > 0.5:  # Process confident detections
                    if class_name == "person":
                        person_count += 1

                    detections.append({
                        "class": class_name,
                        "confidence": round(confidence, 2),
                        "bbox": [x1, y1, x2, y2]
                    })

                    # Draw bounding boxes on the frame
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

        # Encode the frame as JPEG
        _, buffer = cv2.imencode(".jpg", frame)
        frame_bytes = buffer.tobytes()

        # Convert the image to base64
        image_base64 = base64.b64encode(frame_bytes).decode('utf-8')

        # Create a combined JSON structure
        frame_data = {
            "image": image_base64,
            "person_count": person_count,
            "detections": detections
        }

        # Yield the JSON as a single frame
        yield f"data: {json.dumps(frame_data)}\n\n"


@app.get("/stream")
def stream_video_with_data():
    return StreamingResponse(
        generate_frames_with_data(), media_type="text/event-stream"
    )
