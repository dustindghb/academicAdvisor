// scripts/test-vectorize-debug.js
const { ChromaClient } = require('chromadb');
const readline = require('readline');

// Create readline interface for user interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper to create a promise-based version of rl.question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

async function connectToChroma() {
  // Use the same connection settings as in vectorize.js
  const client = new ChromaClient({
    path: 'http://192.168.0.105:8000',
    fetchOptions: {
      timeout: 60000 // 60 second timeout
    }
  });
  
  console.log('Connecting to ChromaDB...');
  
  try {
    // List all collections to verify connectivity
    console.log('Listing available collections:');
    const collections = await client.listCollections();
    console.log(collections);
    
    // Get the collection WITHOUT the dummy embedding function
    // This allows us to see what's actually stored in ChromaDB
    const collection = await client.getCollection({
      name: 'scu_bulletins'
    });
    
    console.log('Connected to collection "scu_bulletins" successfully\n');
    return { client, collection };
  } catch (error) {
    console.error('Error connecting to ChromaDB:', error.message);
    throw error;
  }
}

async function diagnosticTests(client, collection) {
  try {
    // 1. Check how many documents are in the collection
    const count = await collection.count();
    console.log(`Collection contains ${count} documents`);
    
    // 2. Get some sample document IDs and metadata
    console.log('\nRetrieving sample documents...');
    const sampleDocs = await collection.get({ limit: 3 });
    
    if (sampleDocs.ids.length > 0) {
      console.log('\nSample documents:');
      for (let i = 0; i < sampleDocs.ids.length; i++) {
        console.log(`\nDocument ${i+1}:`);
        console.log(`ID: ${sampleDocs.ids[i]}`);
        console.log(`Metadata: ${JSON.stringify(sampleDocs.metadatas[i])}`);
        // Show just a preview of the content
        console.log(`Content preview: ${sampleDocs.documents[i].substring(0, 100)}...`);
      }
    } else {
      console.log('No documents found in the collection');
    }
    
    // 3. Check if embeddings exist in the collection
    console.log('\nChecking for embeddings...');
    try {
      // Try to get embeddings for a sample document
      const withEmbeddings = await collection.get({
        ids: sampleDocs.ids.slice(0, 1),
        include: ["embeddings"]
      });
      
      if (withEmbeddings.embeddings && withEmbeddings.embeddings.length > 0) {
        const embedding = withEmbeddings.embeddings[0];
        console.log(`Embedding exists with length: ${embedding.length}`);
        
        // Check if all values are zeros
        const allZeros = embedding.every(val => val === 0);
        if (allZeros) {
          console.log('WARNING: All embedding values are zeros. This will cause identical results for any query.');
        } else {
          console.log('Embedding contains non-zero values (good)');
          // Show first few values
          console.log(`First few values: ${embedding.slice(0, 5)}`);
        }
      } else {
        console.log('No embeddings found for the document');
      }
    } catch (error) {
      console.log('Error retrieving embeddings:', error.message);
    }
    
    // 4. Test raw query without dummy embedding function
    console.log('\n--- Testing Raw Retrieval ---');
    console.log('This will retrieve documents based on their existing embeddings in ChromaDB');
    
    const rawQuery = await question('\nEnter search keyword for raw query test: ');
    console.log(`Running query for: "${rawQuery}"...`);
    
    try {
      const rawResults = await collection.query({
        queryTexts: [rawQuery],
        nResults: 3
      });
      
      console.log(`Raw query returned ${rawResults.ids[0].length} results`);
      
      for (let i = 0; i < rawResults.ids[0].length; i++) {
        console.log(`\nResult ${i+1}:`);
        console.log(`ID: ${rawResults.ids[0][i]}`);
        console.log(`Source: ${rawResults.metadatas[0][i].source}, Chunk: ${rawResults.metadatas[0][i].chunk}`);
        console.log(`Content preview: ${rawResults.documents[0][i].substring(0, 150)}...`);
      }
    } catch (error) {
      console.log('Error in raw query:', error.message);
    }
    
    // 5. Test metadata filtering (which doesn't rely on embeddings)
    console.log('\n--- Testing Metadata Filtering ---');
    console.log('This retrieves documents by metadata not by embeddings');
    
    if (sampleDocs.metadatas.length > 0) {
      const sampleSource = sampleDocs.metadatas[0].source;
      console.log(`Retrieving documents with source = "${sampleSource}"`);
      
      const metadataResults = await collection.get({
        where: { source: sampleSource },
        limit: 3
      });
      
      console.log(`Found ${metadataResults.ids.length} documents with this source`);
      
      for (let i = 0; i < metadataResults.ids.length; i++) {
        console.log(`\nDocument ${i+1}:`);
        console.log(`ID: ${metadataResults.ids[i]}`);
        console.log(`Chunk: ${metadataResults.metadatas[i].chunk}`);
        console.log(`Content preview: ${metadataResults.documents[i].substring(0, 150)}...`);
      }
    } else {
      console.log('No sample metadata available to test filtering');
    }
  } catch (error) {
    console.error('Error in diagnostic tests:', error.message);
  }
}

async function main() {
  try {
    // Connect to ChromaDB
    const { client, collection } = await connectToChroma();
    
    // Run diagnostic tests
    await diagnosticTests(client, collection);
    
    console.log('\nDiagnostic tests complete. Press Enter to exit...');
    await question('');
    
  } catch (error) {
    console.error('Fatal error in test script:', error);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Run the script
console.log('Starting ChromaDB Diagnostics Tool...');
main().catch(err => {
  console.error('Fatal error:', err);
  rl.close();
  process.exit(1);
});