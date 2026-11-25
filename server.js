// Servidor: serve a página e repassa mensagens de sinalização WebRTC entre as pessoas da mesma sala.
const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const MAX_PESSOAS = 6; // cada pessoa envia a tela para todas as outras, então muita gente pesa na internet

const app = express();
app.use(express.static("public"));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const salas = new Map(); // codigo -> Set<ws>
const enviar = (c, obj) => c.readyState === 1 && c.send(JSON.stringify(obj));

wss.on("connection", (ws) => {
  ws.id = crypto.randomBytes(4).toString("hex");
  ws.compartilhando = false;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "entrar") {
      if (ws.sala) return;
      const codigo = String(msg.sala || "").trim().slice(0, 32);
      if (!codigo) return;
      if (!salas.has(codigo)) salas.set(codigo, new Set());
      const sala = salas.get(codigo);
      if (sala.size >= MAX_PESSOAS) return enviar(ws, { type: "cheia", max: MAX_PESSOAS });

      ws.sala = codigo;
      ws.nome = String(msg.nome || "").trim().slice(0, 24) || "Anônimo";
      enviar(ws, {
        type: "bem-vindo",
        id: ws.id,
        pessoas: [...sala].map((c) => ({ id: c.id, nome: c.nome, compartilhando: c.compartilhando })),
      });
      sala.forEach((c) => enviar(c, { type: "entrou", id: ws.id, nome: ws.nome }));
      sala.add(ws);
      return;
    }

    const sala = ws.sala && salas.get(ws.sala);
    if (!sala) return;

    if (msg.type === "compartilhando") {
      ws.compartilhando = !!msg.valor;
      sala.forEach((c) => c !== ws && enviar(c, { type: "compartilhando", de: ws.id, valor: ws.compartilhando }));
      return;
    }

    if (["offer", "answer", "ice"].includes(msg.type)) {
      sala.forEach((c) => {
        if (c.id === msg.para) enviar(c, { type: msg.type, de: ws.id, sdp: msg.sdp, candidate: msg.candidate });
      });
    }
  });

  ws.on("close", () => {
    const sala = ws.sala && salas.get(ws.sala);
    if (!sala) return;
    sala.delete(ws);
    sala.forEach((c) => enviar(c, { type: "saiu", id: ws.id }));
    if (sala.size === 0) salas.delete(ws.sala);
  });
});

// Mantém as conexões vivas em hospedagens que derrubam conexões paradas
setInterval(() => wss.clients.forEach((c) => c.readyState === 1 && c.ping()), 30000);

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => console.log(`Rodando em http://localhost:${PORTA}`));
