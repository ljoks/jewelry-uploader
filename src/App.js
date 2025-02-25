import React from 'react';
import ImageUploader from './ImageUploader';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';


const theme = createTheme({
  palette: {
    mode: 'dark',
  },

});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
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
