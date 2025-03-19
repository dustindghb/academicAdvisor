// backend/server.js
const express = require('express');
const cors = require('cors');
const { ChromaClient } = require('chromadb');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Initialize ChromaDB client
const client = new ChromaClient({ path: 'http://localhost:8000' });

// Endpoint to query the vector database
app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ message: 'Query is required' });
    }
    
    // Simple pass-through embedding function
    const passThroughEmbedder = {
      generate: async (texts) => texts.map(() => [])
    };
    
    const collection = await client.getCollection({
      name: 'scu_bulletins',
      embeddingFunction: passThroughEmbedder
    });
    
    const results = await collection.query({
      queryTexts: [query],
      nResults: 5
    });
    
    const documents = results.documents[0] || [];
    const context = documents.join('\n\n');
    
    // Call Ollama with RAG prompt
    const ollamaResponse = await fetch('http://your-ssh-machine:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: '3.2',
        prompt: `You are an assistant for SCU (Santa Clara University). 
Use the following context to answer the question.
Context: ${context}
Question: ${query}
Answer:`,
        stream: false
      })
    });
    
    const data = await ollamaResponse.json();
    res.json({ answer: data.response });
    
  } catch (error) {
    console.error('RAG query error:', error);
    res.status(500).json({ message: 'Error processing your query' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});