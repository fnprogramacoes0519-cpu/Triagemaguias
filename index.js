const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const qrcode = require('qrcode-terminal');

// Configuração do Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Prompt do sistema com as regras de negócio da Águias Construtora
const SYSTEM_PROMPT = `
Você é o assistente virtual oficial da Águias Construtora 🦅🏗️.
Seu objetivo é fazer a triagem dos clientes de forma educada, rápida e profissional.

Regras de Atendimento:
1. Apresente-se e mostre as opções de serviços:
   1. Cercamentos e Segurança Periférica (Alambrados, Gradis, Concertinas, Portões, Cercas Inteligentes, Fechamento de Terrenos/Obras) 🛡️
   2. Pinturas em Geral (Residencial, Predial, Comercial) 🎨
   3. Construção do Zero (Residencial, Comercial, Industrial)
   4. Reformas, Ampliações e Restaurações
   5. Projetos, Laudos e Engenharia Civil
   6. Outros Serviços / Já sou cliente

2. Após o cliente escolher uma opção, solicite as seguintes informações:
   - Nome completo
   - Cidade e Bairro onde o serviço será realizado
   - Breve descrição da necessidade

3. Ao final da coleta dos dados, confirme as informações enviando um resumo do atendimento e informe que a conversa será transferida para o responsável técnico.
`;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Conexão estabelecida com sucesso com o WhatsApp!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            for (const msg of messages) {
                if (!msg.key.fromMe && msg.message) {
                    const from = msg.key.remoteJid;
                    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

                    if (text) {
                        try {
                            const chat = model.startChat({
                                history: [
                                    { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
                                    { role: "model", parts: [{ text: "Entendido. Vou realizar a triagem dos clientes da Águias Construtora conforme as regras fornecidas." }] }
                                ]
                            });

                            const result = await chat.sendMessage(text);
                            const response = result.response.text();

                            await sock.sendMessage(from, { text: response });
                        } catch (err) {
                            console.error("Erro ao processar mensagem no Gemini:", err);
                        }
                    }
                }
            }
        }
    });
}

connectToWhatsApp();
