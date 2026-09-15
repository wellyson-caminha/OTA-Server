const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { put } = require('@vercel/blob');
const { Redis } = require('@upstash/redis'); // Pacote atualizado

const app = express();
const upload = multer({ dest: '/tmp/' }); 
const redis = Redis.fromEnv(); // Inicializa a conexão com o banco

// ROTA 1: ESP32 busca por atualizações
app.get('/api/update/:projeto', async (req, res) => {
    const projeto = req.params.projeto;
    const espVersion = req.headers['x-esp32-version'];
    
    // Agora usamos redis.get em vez de kv.get
    const dadosProjeto = await redis.get(`ota:${projeto}`);

    if (!dadosProjeto) {
        return res.status(404).send('Projeto não encontrado');
    }

    if (espVersion && espVersion !== dadosProjeto.versao) {
        console.log(`[${projeto}] Atualizando da ${espVersion} para ${dadosProjeto.versao}`);
        res.redirect(302, dadosProjeto.url);
    } else {
        console.log(`[${projeto}] Dispositivo já atualizado.`);
        res.status(304).send();
    }
});

// ROTA 2: Você faz o upload de uma nova versão
app.post('/api/upload/:projeto', upload.single('firmware'), async (req, res) => {
    const projeto = req.params.projeto;
    const novaVersao = req.body.versao; 
    const file = req.file;

    if (!file || !novaVersao) {
        return res.status(400).send('Arquivo .bin ou versão ausente.');
    }

    try {
        const fileData = fs.readFileSync(file.path);
        const blob = await put(`${projeto}/${novaVersao}.bin`, fileData, {
            access: 'public',
            addRandomSuffix: false
        });

        // Agora usamos redis.set em vez de kv.set
        await redis.set(`ota:${projeto}`, {
            versao: novaVersao,
            url: blob.url
        });

        fs.unlinkSync(file.path);

        res.status(200).json({ 
            mensagem: 'Upload concluído!', 
            projeto, 
            versao: novaVersao, 
            url: blob.url 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Erro ao processar o upload.');
    }
});

module.exports = app;