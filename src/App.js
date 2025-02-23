import React from 'react';
import ImageUploader from './ImageUploader';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme();

function App() {
  return (
    <ThemeProvider theme={theme}>
      <div className="App">
      <header className="App-header">
        {/* <h1>Jewelry Bulk Upload</h1> */}
      </header>
      <ImageUploader />
    </div>
    </ThemeProvider>
    
  );
}

export default App;
