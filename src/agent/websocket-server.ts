// WebSocket Server for PC Agent connections

import { WebSocketServer, WebSocket } from "ws";
import { verifyPairingCode } from "./pairing";

interface ConnectedAgent {
  ws: WebSocket;
  userId: number;
  deviceId: string;
  status: "connected" | "busy" | "offline";
}

const connectedAgents = new Map<string, ConnectedAgent>();

export const startWebSocketServer = (port: number = 8080) => {
  const wss = new WebSocketServer({ port });

  console.log(`🔌 WebSocket server running on port ${port}`);

  wss.on("connection", (ws: WebSocket) => {
    console.log("📡 New PC Agent connection attempt");

    ws.on("message", async (data: string) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "pair":
            // Handle pairing code
            const { code, deviceId } = message;
            const result = verifyPairingCode(code, deviceId);

            if (result.success && result.userId) {
              connectedAgents.set(deviceId, {
                ws,
                userId: result.userId,
                deviceId,
                status: "connected",
              });

              ws.send(JSON.stringify({
                type: "paired",
                success: true,
                message: "Successfully paired with NEXUM",
              }));

              console.log(`✅ Agent paired: ${deviceId} for user ${result.userId}`);
            } else {
              ws.send(JSON.stringify({
                type: "paired",
                success: false,
                message: "Invalid or expired pairing code",
              }));
            }
            break;

          case "status":
            // Handle status update
            const agent = connectedAgents.get(message.deviceId);
            if (agent) {
              agent.status = message.status;
              console.log(`📊 Agent ${message.deviceId} status: ${message.status}`);
            }
            break;

          case "screenshot":
            // Handle screenshot data
            const userAgent = connectedAgents.get(message.deviceId);
            if (userAgent) {
              console.log(`📸 Screenshot received from ${message.deviceId}`);
              // TODO: Forward to Telegram user
            }
            break;

          case "command_result":
            // Handle command execution result
            console.log(`✅ Command result from ${message.deviceId}:`, message.result);
            break;

          default:
            console.log("❓ Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("Error processing message:", error);
        ws.send(JSON.stringify({
          type: "error",
          message: "Invalid message format",
        }));
      }
    });

    ws.on("close", () => {
      // Mark agent as offline
      for (const [deviceId, agent] of connectedAgents.entries()) {
        if (agent.ws === ws) {
          agent.status = "offline";
          console.log(`🔴 Agent disconnected: ${deviceId}`);
          break;
        }
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  return wss;
};

// Send command to specific agent
export const sendCommandToAgent = (
  deviceId: string,
  command: string,
  params?: any
): boolean => {
  const agent = connectedAgents.get(deviceId);
  if (agent && agent.status === "connected") {
    agent.ws.send(JSON.stringify({
      type: "command",
      command,
      params,
      timestamp: new Date().toISOString(),
    }));
    return true;
  }
  return false;
};

// Get user's connected agents
export const getUserAgents = (userId: number): Array<{ deviceId: string; status: string }> => {
  const agents: Array<{ deviceId: string; status: string }> = [];
  for (const [deviceId, agent] of connectedAgents.entries()) {
    if (agent.userId === userId) {
      agents.push({ deviceId, status: agent.status });
    }
  }
  return agents;
};
