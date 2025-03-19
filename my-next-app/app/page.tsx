// app/page.tsx
"use client";

import { useState } from "react";
import { 
  TextField, 
  Button, 
  Container, 
  Typography, 
  Box, 
  Paper, 
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import SchoolIcon from "@mui/icons-material/School";

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResults([]);
    
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      console.error("Error:", err);
      setError("An error occurred while processing your search. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 0, mb: 4, overflow: "hidden" }}>
        <Box 
          sx={{ 
            p: 3, 
            bgcolor: "primary.main", 
            color: "primary.contrastText",
            display: "flex",
            alignItems: "center"
          }}
        >
          <SchoolIcon sx={{ mr: 2, fontSize: 32 }} />
          <Box>
            <Typography variant="h4" component="h1" gutterBottom={false} fontWeight="bold">
              SCU Semantic Search
            </Typography>
            <Typography variant="subtitle1">
              Search through Santa Clara University information using semantic similarity
            </Typography>
          </Box>
        </Box>
        
        <Box component="form" onSubmit={handleSubmit} sx={{ p: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={9}>
              <TextField
                fullWidth
                variant="outlined"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What would you like to search for?"
                disabled={loading}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <Button 
                fullWidth
                type="submit" 
                variant="contained" 
                disabled={loading || !query.trim()}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                sx={{ height: 56 }} // Match height with TextField
              >
                {loading ? "Searching..." : "Search"}
              </Button>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Paper sx={{ p: 4, textAlign: "center", mb: 4 }}>
          <CircularProgress size={40} />
          <Typography sx={{ mt: 2 }}>Searching for semantically similar content...</Typography>
        </Paper>
      )}

      {results.length > 0 && !loading && (
        <Card elevation={2}>
          <CardHeader 
            title="Search Results" 
            titleTypographyProps={{ variant: "h6" }}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent>
            <List>
              {results.map((result, index) => (
                <Box key={index} sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Result {index + 1} - Score: {(result.distance || 0).toFixed(2)}
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: "background.paper" }}>
                    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                      {result.document || "No content available"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Source: {result.metadata?.source || "Unknown"} 
                      {result.metadata?.chunk !== undefined && ` (Chunk: ${result.metadata.chunk})`}
                    </Typography>
                  </Paper>
                </Box>
              ))}
            </List>
          </CardContent>
          <Box sx={{ p: 2, bgcolor: "action.hover", textAlign: "right" }}>
            <Typography variant="caption" color="text.secondary">
              Powered by ChromaDB Vector Search
            </Typography>
          </Box>
        </Card>
      )}

      {results.length === 0 && !loading && query.trim() !== "" && !error && (
        <Alert severity="info" sx={{ mb: 4 }}>
          No results found for your search. Try using different keywords.
        </Alert>
      )}
    </Container>
  );
}