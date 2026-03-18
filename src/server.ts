// Express server for dashboard and API

import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (dashboard)
app.use(express.static(path.join(__dirname, "public")));

// Dashboard route
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes (coming soon)
app.get("/api/user/:id", (req, res) => {
  // TODO: Get user data from DB
  res.json({ id: req.params.id, plan: "free" });
});

export const startServer = () => {
  app.listen(PORT, () => {
    console.log(`🌐 Dashboard server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  });
};

export default app;
