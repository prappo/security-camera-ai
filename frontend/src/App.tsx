import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PersonStanding, AlertCircle, Settings, Trash as TrashIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Detection {
  class: string;
  confidence: number;
}

interface StreamData {
  person_count: number;
  detections: Detection[];
}

interface DetectionRule {
  id: string;
  detectionClass: string;
  threshold: number;
  actions: {
    sendEmail: boolean;
    sendMessage: boolean;
    emailAddress?: string;
    phoneNumber?: string;
  };
}

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [data, setData] = useState<StreamData>({ person_count: 0, detections: [] });
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState("http://localhost:8000/stream");
  const [isConnected, setIsConnected] = useState(false);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [detectionRules, setDetectionRules] = useState<DetectionRule[]>([]);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState<Omit<DetectionRule, 'id'>>({
    detectionClass: '',
    threshold: 50,
    actions: {
      sendEmail: false,
      sendMessage: false,
    }
  });
  const eventSourceRef = useRef<EventSource | null>(null);
  
  const connectToStream = () => {
    if (isConnected) {
      return;
    }

    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;
    setIsConnected(true);

    eventSource.onmessage = (event) => {
      const parsedData = JSON.parse(event.data);
      setImage(`data:image/jpeg;base64,${parsedData.image}`);
      setData({
        person_count: parsedData.person_count,
        detections: parsedData.detections,
      });
      checkAndTriggerActions(parsedData.detections);
      setError(null);
    };

    eventSource.onerror = () => {
      setError("Error connecting to stream.");
      setIsConnected(false);
      eventSource.close();
      eventSourceRef.current = null;
      
      if (autoReconnect) {
        setTimeout(connectToStream, 5000);
      }
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  };

  const disconnectFromStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      setImage(null);
      setData({ person_count: 0, detections: [] });
    }
  };

  useEffect(() => {
    const cleanup = connectToStream();
    return () => cleanup && cleanup();
  }, [streamUrl]); // Reconnect when URL changes

  const loadRules = async () => {
    try {
      const response = await fetch('http://localhost:8000/rules');
      const rules = await response.json();
      setDetectionRules(rules);
    } catch (error) {
      setError('Failed to load detection rules');
    }
  };

  const saveRuleToServer = async (rule: DetectionRule) => {
    try {
      const response = await fetch('http://localhost:8000/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rule),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save rule');
      }
      
      await loadRules(); // Reload rules after saving
    } catch (error) {
      setError('Failed to save detection rule');
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/rules/${ruleId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete rule');
      }
      
      await loadRules(); // Reload rules after deletion
    } catch (error) {
      setError('Failed to delete rule');
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleAddRule = async (rule: DetectionRule) => {
    await saveRuleToServer(rule);
    setShowAddRule(false);
  };

  const checkAndTriggerActions = (detections: Detection[]) => {
    detectionRules.forEach(rule => {
      const matchingDetection = detections.find(
        det => det.class === rule.detectionClass && det.confidence * 100 >= rule.threshold
      );

      if (matchingDetection) {
        if (rule.actions.sendEmail && rule.actions.emailAddress) {
          // In a real application, you would call your backend API here
          console.log(`Sending email to ${rule.actions.emailAddress} for ${rule.detectionClass} detection`);
        }
        if (rule.actions.sendMessage && rule.actions.phoneNumber) {
          console.log(`Sending message to ${rule.actions.phoneNumber} for ${rule.detectionClass} detection`);
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="container mx-auto max-w-7xl">
        <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl mb-8">
          Security Camera AI
        </h1>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left side - Live Preview */}
          <div className="md:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Live Stream</span>
                  <Badge variant={isConnected ? "success" : "destructive"}>
                    {isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {image ? (
                  <img
                    src={image}
                    alt="Webcam Stream"
                    className="w-full rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground">No stream data</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right side - Configuration and Results */}
          <div className="space-y-6">
            {/* Configuration Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-6 w-6" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="stream-url">Stream URL</Label>
                  <Input
                    id="stream-url"
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    placeholder="Enter stream URL..."
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-reconnect">Auto Reconnect</Label>
                  <Switch
                    id="auto-reconnect"
                    checked={autoReconnect}
                    onCheckedChange={setAutoReconnect}
                  />
                </div>
                <Button 
                  className="w-full"
                  variant={isConnected ? "destructive" : "default"}
                  onClick={() => {
                    if (isConnected) {
                      disconnectFromStream();
                    } else {
                      connectToStream();
                    }
                  }}
                >
                  {isConnected ? "Disconnect" : "Connect"}
                </Button>
              </CardContent>
            </Card>

            {/* Detection Results Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PersonStanding className="h-6 w-6" />
                  Detection Results
                  <Badge variant="secondary" className="ml-2">
                    {data.person_count} people
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {data.detections.map((det, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted"
                    >
                      <span className="font-medium">{det.class}</span>
                      <Badge variant="default">
                        {(det.confidence * 100).toFixed(1)}% confidence
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Detection Rules Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-6 w-6" />
                  Detection Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {detectionRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3 rounded-lg bg-muted space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{rule.detectionClass}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{rule.threshold}% threshold</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => deleteRule(rule.id)}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {rule.actions.sendEmail && (
                        <div>Email: {rule.actions.emailAddress}</div>
                      )}
                      {rule.actions.sendMessage && (
                        <div>SMS: {rule.actions.phoneNumber}</div>
                      )}
                    </div>
                  </div>
                ))}

                {showAddRule ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="detection-class">Detection Class</Label>
                      <Input
                        id="detection-class"
                        placeholder="e.g., person, car, etc."
                        onChange={(e) => setNewRule({
                          ...newRule,
                          detectionClass: e.target.value
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="threshold">Confidence Threshold (%)</Label>
                      <Input
                        id="threshold"
                        type="number"
                        min="0"
                        max="100"
                        onChange={(e) => setNewRule({
                          ...newRule,
                          threshold: Number(e.target.value)
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="send-email">Send Email</Label>
                        <Switch
                          id="send-email"
                          checked={newRule.actions.sendEmail}
                          onCheckedChange={(checked) => setNewRule({
                            ...newRule,
                            actions: { ...newRule.actions, sendEmail: checked }
                          })}
                        />
                      </div>
                      {newRule.actions.sendEmail && (
                        <Input
                          placeholder="Email address"
                          type="email"
                          onChange={(e) => setNewRule({
                            ...newRule,
                            actions: { ...newRule.actions, emailAddress: e.target.value }
                          })}
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="send-message">Send SMS</Label>
                        <Switch
                          id="send-message"
                          checked={newRule.actions.sendMessage}
                          onCheckedChange={(checked) => setNewRule({
                            ...newRule,
                            actions: { ...newRule.actions, sendMessage: checked }
                          })}
                        />
                      </div>
                      {newRule.actions.sendMessage && (
                        <Input
                          placeholder="Phone number"
                          type="tel"
                          onChange={(e) => setNewRule({
                            ...newRule,
                            actions: { ...newRule.actions, phoneNumber: e.target.value }
                          })}
                        />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleAddRule({
                        ...newRule,
                        id: crypto.randomUUID()
                      })}>
                        Save Rule
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddRule(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setShowAddRule(true)}
                  >
                    Add Detection Rule
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
