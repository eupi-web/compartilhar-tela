// Servidor: serve a página e repassa mensagens de sinalização WebRTC entre as pessoas da mesma sala.
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.static("public"));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const salas = new Map(); // codigo -> Set<ws>

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "entrar") {
      ws.sala = String(msg.sala || "").slice(0, 32);
      if (!salas.has(ws.sala)) salas.set(ws.sala, new Set());
      const sala = salas.get(ws.sala);
      // avisa quem já está na sala que chegou alguém
      sala.forEach((c) => c.readyState === 1 && c.send(JSON.stringify({ type: "chegou" })));
      sala.add(ws);
      return;
    }
    // offer / answer / ice: repassa para os outros da sala
    const sala = salas.get(ws.sala);
    if (!sala) return;
    sala.forEach((c) => c !== ws && c.readyState === 1 && c.send(JSON.stringify(msg)));
  });

  ws.on("close", () => {
    const sala = salas.get(ws.sala);
    if (!sala) return;
    sala.delete(ws);
    sala.forEach((c) => c.readyState === 1 && c.send(JSON.stringify({ type: "saiu" })));
    if (sala.size === 0) salas.delete(ws.sala);
  });
});

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => console.log(`Rodando em http://localhost:${PORTA}`));
