import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import exifr from 'exifr';
import { 
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  Button,
  Card,
  CardMedia,
  CardContent,
  LinearProgress,
  Box,
  Grid,
  CircularProgress,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { styled } from '@mui/system';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// Styled components for dropzone area and image thumbnail card.
const DropzoneArea = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  textAlign: 'center',
  color: theme.palette.primary.main,
  border: `2px dashed ${theme.palette.primary.main}`,
  backgroundColor: theme.palette.background.paper,
  cursor: 'pointer',
  transition: 'background-color 0.2s ease',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

const ThumbnailCard = styled(Card)(({ theme }) => ({
  width: 120,
  margin: theme.spacing(1),
  position: 'relative',
}));

// Utility: Convert a File object to a Base64 string.
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]); // strip out "data:image/..."
    reader.onerror = (error) => reject(error);
  });

const ImageUploader = () => {
  // "page" can be "upload" or "listings"
  const [page, setPage] = useState('upload');
  const [files, setFiles] = useState([]); // List of uploaded image objects.
  const [uploadProgress, setUploadProgress] = useState({});
  // listings: array of objects { description, imageIndices } returned from GPT-4 vision.
  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);

  // onDrop handler for react-dropzone.
  // Accept only JPEG and PNG files.
  const onDrop = useCallback(async (acceptedFiles) => {
    const processedFiles = await Promise.all(
      acceptedFiles.map(async (file) => {
        const url = URL.createObjectURL(file);
        let dateTime;
        try {
          const exifData = await exifr.parse(file);
          dateTime = exifData && (exifData.DateTimeOriginal || exifData.CreateDate)
            ? new Date(exifData.DateTimeOriginal || exifData.CreateDate)
            : new Date(file.lastModified);
        } catch (err) {
          dateTime = new Date(file.lastModified);
        }
        return { file, url, dateTime, id: `${file.name}-${file.lastModified}-${Math.random()}` };
      })
    );

    setFiles((prev) => [...prev, ...processedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: 'image/jpeg, image/png',
    multiple: true,
  });

  // Allow drag & drop reordering of images.
  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const updatedFiles = Array.from(files);
    const [removed] = updatedFiles.splice(source.index, 1);
    updatedFiles.splice(destination.index, 0, removed);
    setFiles(updatedFiles);
  };

  // Delete an image from the list.
  const handleDeleteImage = (index) => {
    const updatedFiles = Array.from(files);
    updatedFiles.splice(index, 1);
    setFiles(updatedFiles);
  };

  // Dummy upload simulation for progress indicator.
  const simulateUpload = (fileId) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
      if (progress >= 100) clearInterval(interval);
    }, 100);
  };

  // Simulate upload for each new file.
  files.forEach(fileObj => {
    if (!uploadProgress[fileObj.id]) {
      simulateUpload(fileObj.id);
    }
  });

  // Handler for confirming groupings.
  // Uses GPT-4 vision to automatically group images and generate descriptions.
  const handleConfirm = async () => {
    if (files.length === 0) {
      alert("No images uploaded!");
      return;
    }
    setLoadingListings(true);
    try {
      // Convert each file to Base64.
      const base64Images = await Promise.all(
        files.map(async (img) => {
          const base64 = await fileToBase64(img.file);
          return `data:image/jpeg;base64,${base64}`;
        })
      );

      // Build the messages array with a prompt.
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are an expert jewelry marketer. Given the following images of various jewelry pieces taken from multiple angles, please automatically group them by individual item and generate a detailed, marketing-friendly description for each item. Return your result in JSON format as an array of objects, where each object has a 'description' field and an 'imageIndices' field (0-indexed, referring to the order of the images provided)."
            },
            ...base64Images.map(b64 => ({
              type: "image_url",
              image_url: {
                url: b64,
                detail: "low"
              }
            }))
          ]
        }
      ];

      // Build the API payload.
      const payload = {
        model: "gpt-4o-mini", // adjust as needed
        messages,
        max_tokens: 500,
      };

      // Call the serverless function (or proxy) endpoint.
      const response = await fetch('/api/generateGroupingAndDescriptions', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${errorText}`);
      }

      const result = await response.json();
      // Expected result format: an array of objects like:
      // [ { description: "Detailed description...", imageIndices: [0, 2, 4] }, ... ]
      setListings(result);
      setPage("listings");
    } catch (error) {
      console.error("Error generating groups and descriptions:", error);
      alert("Error generating groups and descriptions. Please try again.");
    } finally {
      setLoadingListings(false);
    }
  };

  // Render the fake auction listings page.
  const renderListings = () => (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Fake Auction Listings
      </Typography>
      {listings.map((listing, idx) => (
        <Paper key={idx} sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">Jewelry Item {idx + 1}</Typography>
          <Typography variant="body1" sx={{ my: 1 }}>
            {listing.description}
          </Typography>
          <Grid container spacing={2}>
            {listing.imageIndices.map(imageIndex => (
              <Grid item xs={4} key={imageIndex}>
                <img src={files[imageIndex].url} alt={`Item ${idx} - Image ${imageIndex}`} style={{ width: '100%', borderRadius: '4px' }} />
              </Grid>
            ))}
          </Grid>
        </Paper>
      ))}
      <Button variant="contained" onClick={() => setPage("upload")} sx={{ mt: 2 }}>
        Back to Upload
      </Button>
    </Container>
  );

  // Render the upload page.
  const renderUpload = () => (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">
            Jewelry Bulk Upload
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <DropzoneArea {...getRootProps()}>
          <input {...getInputProps()} />
          {isDragActive ? (
            <Typography variant="body1">Drop the images here...</Typography>
          ) : (
            <Typography variant="body1">
              Drag & drop images here, or click to select JPEG or PNG files
            </Typography>
          )}
        </DropzoneArea>
        {files.length > 0 && (
          <>
            <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
              Uploaded Images
            </Typography>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="files-droppable" direction="horizontal">
                {(provided) => (
                  <Box ref={provided.innerRef} {...provided.droppableProps} sx={{ display: 'flex', overflowX: 'auto', p: 1 }}>
                    {files.map((img, index) => (
                      <Draggable key={img.id} draggableId={img.id} index={index}>
                        {(provided) => (
                          <Box
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            sx={{ position: 'relative', mr: 1 }}
                          >
                            <ThumbnailCard>
                              <CardMedia
                                component="img"
                                height="100"
                                image={img.url}
                                alt={`Uploaded ${index}`}
                              />
                              <CardContent sx={{ p: 1 }}>
                                {uploadProgress[img.id] !== undefined && (
                                  <LinearProgress variant="determinate" value={uploadProgress[img.id]} />
                                )}
                              </CardContent>
                            </ThumbnailCard>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteImage(index)}
                              sx={{ position: 'absolute', top: 0, right: 0 }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </Box>
                )}
              </Droppable>
            </DragDropContext>
            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button variant="contained" onClick={handleConfirm}>
                Confirm Groupings
              </Button>
              {loadingListings && <CircularProgress size={24} sx={{ ml: 2 }} />}
            </Box>
          </>
        )}
      </Container>
    </>
  );

  return page === "upload" ? renderUpload() : renderListings();
};

export default ImageUploader;
