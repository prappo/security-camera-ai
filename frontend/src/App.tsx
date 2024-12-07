import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PersonStanding, AlertCircle, Settings, Trash as TrashIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChangeEvent } from "react";

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
    emailSubject?: string;
    emailMessage?: string;
    phoneNumber?: string;
    smsMessage?: string;
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
  const [editingRule, setEditingRule] = useState<string | null>(null);
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
    } catch (error: unknown) {
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

  const handleEditRule = (rule: DetectionRule) => {
    setNewRule(rule);
    setEditingRule(rule.id);
    setShowAddRule(true);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="container mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
          <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Security Camera AI
          </h1>
          
          {/* Live Detections Panel - Compact Game Score Style */}
          <div className="bg-black/10 backdrop-blur-sm rounded-lg p-2 shadow-md border border-border/50">
            <div className="flex items-center gap-3">
              {/* Person Count */}
              <div className="flex items-center gap-1.5">
                <PersonStanding className="h-4 w-4 text-primary" />
                <div className="flex flex-col leading-none">
                  <span className="text-[10px] text-muted-foreground font-medium">PEOPLE</span>
                  <span className="text-xl font-bold tabular-nums">
                    {data.person_count.toString().padStart(2, '0')}
                  </span>
                </div>
              </div>

              {/* Vertical Divider */}
              <div className="h-8 w-px bg-border/50" />

              {/* Live Detections */}
              <div className="flex flex-col leading-none min-w-[120px]">
                <span className="text-[10px] text-muted-foreground font-medium">DETECTIONS</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {data.detections.length > 0 ? (
                    data.detections.map((det, index) => (
                      <div
                        key={index}
                        className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-primary/10 border border-primary/20"
                      >
                        <span className="text-xs font-medium capitalize">{det.class}</span>
                        <span className="text-[10px] font-bold text-primary">
                          {(det.confidence * 100).toFixed(0)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Left side - Live Preview */}
          <div className="md:col-span-2 md:sticky md:top-8 md:h-[calc(100vh-8rem)]">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Live Stream</span>
                  <Badge variant={isConnected ? "success" : "destructive"}>
                    {isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-5rem)] flex items-center">
                {image ? (
                  <img
                    src={image}
                    alt="Webcam Stream"
                    className="w-full rounded-lg shadow-lg object-contain"
                  />
                ) : (
                  <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground">No stream data</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right side - Configuration and Rules (Scrollable) */}
          <div className="space-y-6 md:max-h-[calc(100vh-8rem)] md:overflow-y-auto">
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
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setStreamUrl(e.target.value)}
                    placeholder="Enter stream URL..."
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-reconnect">Auto Reconnect</Label>
                  <Switch
                    id="auto-reconnect"
                    checked={autoReconnect}
                    onCheckedChange={(checked: boolean) => setAutoReconnect(checked)}
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
                          onClick={() => handleEditRule(rule)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
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
                    <div className="text-sm text-muted-foreground space-y-1">
                      {rule.actions.sendEmail && (
                        <div className="space-y-0.5">
                          <div>Email: {rule.actions.emailAddress}</div>
                          <div>Subject: {rule.actions.emailSubject}</div>
                          <div className="line-clamp-1">Message: {rule.actions.emailMessage}</div>
                        </div>
                      )}
                      {rule.actions.sendMessage && (
                        <div className="space-y-0.5">
                          <div>SMS: {rule.actions.phoneNumber}</div>
                          <div className="line-clamp-1">Message: {rule.actions.smsMessage}</div>
                        </div>
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
                        value={newRule.detectionClass}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewRule({
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
                        value={newRule.threshold}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewRule({
                          ...newRule,
                          threshold: Number(e.target.value)
                        })}
                      />
                    </div>

                    {/* Email Settings */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="send-email">Send Email</Label>
                        <Switch
                          id="send-email"
                          checked={newRule.actions.sendEmail}
                          onCheckedChange={(checked: boolean) => setNewRule({
                            ...newRule,
                            actions: { ...newRule.actions, sendEmail: checked }
                          })}
                        />
                      </div>
                      {newRule.actions.sendEmail && (
                        <div className="space-y-2 mt-2">
                          <Input
                            placeholder="Email address"
                            type="email"
                            value={newRule.actions.emailAddress}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewRule({
                              ...newRule,
                              actions: { ...newRule.actions, emailAddress: e.target.value }
                            })}
                          />
                          <Input
                            placeholder="Email subject"
                            value={newRule.actions.emailSubject}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewRule({
                              ...newRule,
                              actions: { ...newRule.actions, emailSubject: e.target.value }
                            })}
                          />
                          <textarea
                            className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            placeholder="Email message"
                            value={newRule.actions.emailMessage}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewRule({
                              ...newRule,
                              actions: { ...newRule.actions, emailMessage: e.target.value }
                            })}
                          />
                        </div>
                      )}
                    </div>

                    {/* SMS Settings */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="send-message">Send SMS</Label>
                        <Switch
                          id="send-message"
                          checked={newRule.actions.sendMessage}
                          onCheckedChange={(checked: boolean) => setNewRule({
                            ...newRule,
                            actions: { ...newRule.actions, sendMessage: checked }
                          })}
                        />
                      </div>
                      {newRule.actions.sendMessage && (
                        <div className="space-y-2 mt-2">
                          <Input
                            placeholder="Phone number"
                            type="tel"
                            value={newRule.actions.phoneNumber}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewRule({
                              ...newRule,
                              actions: { ...newRule.actions, phoneNumber: e.target.value }
                            })}
                          />
                          <textarea
                            className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            placeholder="SMS message"
                            value={newRule.actions.smsMessage}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewRule({
                              ...newRule,
                              actions: { ...newRule.actions, smsMessage: e.target.value }
                            })}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => {
                        if (editingRule) {
                          handleAddRule({
                            ...newRule,
                            id: editingRule
                          });
                        } else {
                          handleAddRule({
                            ...newRule,
                            id: crypto.randomUUID()
                          });
                        }
                        setEditingRule(null);
                      }}>
                        {editingRule ? 'Save Changes' : 'Save Rule'}
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setShowAddRule(false);
                        setEditingRule(null);
                        setNewRule({
                          detectionClass: '',
                          threshold: 50,
                          actions: {
                            sendEmail: false,
                            sendMessage: false,
                          }
                        });
                      }}>
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
