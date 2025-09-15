// app/(main)/forum/create.tsx - Updated with proper Firebase integration
import { Ionicons } from "@expo/vector-icons";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { createForumPost } from "../../../services/forum";

const CreateForumPost = () => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.7,
          base64: false,
          skipProcessing: true,
        });

        if (!photo.uri) {
          throw new Error("Failed to capture photo.");
        }

        setPhotoUri(photo.uri);
        setShowCamera(false);
      } catch (error) {
        console.error("Error taking picture:", error);
        Alert.alert("Error", "Failed to take picture. Please try again.");
      }
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("Missing Title", "Please enter a title for your post.");
      return;
    }

    if (!content.trim()) {
      Alert.alert("Missing Content", "Please enter some content for your post.");
      return;
    }

    setIsSubmitting(true);
    
    try {
      await createForumPost({
        title: title.trim(),
        content: content.trim(),
        imageUri: photoUri || undefined,
      });

      // Clear form after successful submission
      setTitle("");
      setContent("");
      setPhotoUri(null);

      // Success message with navigation
      Alert.alert(
        "Post Submitted Successfully!",
        "Your post has been submitted for review and will appear in the forum once approved by our moderators. This helps us maintain a safe and welcoming community for everyone.",
        [
          {
            text: "OK",
            onPress: () => {
              router.replace("/(main)/forum/");
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error creating post:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to submit post. Please try again.";
      Alert.alert("Submission Failed", errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const removePhoto = () => {
    setPhotoUri(null);
  };

  const handleBackPress = () => {
    if (title.trim() || content.trim() || photoUri) {
      Alert.alert(
        "Discard Changes?",
        "You have unsaved changes. Are you sure you want to go back?",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Discard",
            onPress: () => router.back(),
            style: "destructive",
          },
        ]
      );
    } else {
      router.back();
    }
  };

  // Check if form is valid
  const isFormValid = title.trim().length > 0 && content.trim().length > 0;

  // Camera permission check
  if (showCamera) {
    if (!permission) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D32F2F" />
          <Text style={styles.loadingText}>Loading camera...</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#D32F2F" />
          <Text style={styles.permissionText}>
            We need your permission to use the camera for taking photos.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
          <View style={styles.cameraHeader}>
            <TouchableOpacity
              style={styles.cameraHeaderButton}
              onPress={() => setShowCamera(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>Take Photo</Text>
            <TouchableOpacity
              style={styles.cameraHeaderButton}
              onPress={() => setFacing((current) => (current === "back" ? "front" : "back"))}
            >
              <Ionicons name="camera-reverse" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.cameraControls}>
            <View style={styles.captureContainer}>
              <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                <View style={styles.captureInner} />
              </TouchableOpacity>
            </View>
            <Text style={styles.cameraInstructions}>
              Tap the button to capture a photo for your post
            </Text>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Post</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView 
          style={styles.scrollContainer} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Community Guidelines Notice */}
          <View style={styles.guidelinesContainer}>
            <View style={styles.guidelinesHeader}>
              <Ionicons name="information-circle-outline" size={20} color="#D32F2F" />
              <Text style={styles.guidelinesTitle}>Community Guidelines</Text>
            </View>
            <Text style={styles.guidelinesText}>
              All posts are reviewed by our moderators before being published. Please ensure your content is respectful and follows our community guidelines.
            </Text>
          </View>

          {/* Title Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="Enter post title"
              value={title}
              onChangeText={setTitle}
              placeholderTextColor="#999"
              multiline={false}
              maxLength={100}
            />
            <Text style={styles.charCount}>{title.length}/100</Text>
          </View>

          {/* Content Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Content *</Text>
            <View style={styles.contentInputContainer}>
              <TextInput
                style={styles.contentInput}
                placeholder="Share your thoughts with the community..."
                value={content}
                onChangeText={setContent}
                placeholderTextColor="#999"
                multiline
                textAlignVertical="top"
                scrollEnabled={false}
                maxLength={1000}
              />
              
              {/* Toolbar */}
              <View style={styles.toolbar}>
                <TouchableOpacity
                  style={styles.toolbarButton}
                  onPress={() => setShowCamera(true)}
                >
                  <Ionicons name="camera-outline" size={20} color="#666" />
                  <Text style={styles.toolbarButtonText}>Add Photo</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.charCount}>{content.length}/1000</Text>
          </View>

          {/* Photo Preview */}
          {photoUri && (
            <View style={styles.photoPreviewContainer}>
              <Text style={styles.photoLabel}>Photo Preview</Text>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={removePhoto}
              >
                <Ionicons name="close-circle" size={24} color="#D32F2F" />
              </TouchableOpacity>
            </View>
          )}

          {/* Form Status */}
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>
              Status: {isFormValid ? "Ready to submit" : "Please fill required fields"}
            </Text>
          </View>
        </ScrollView>

        {/* Fixed Submit Button */}
        <View style={styles.submitContainer}>
          <TouchableOpacity
            style={[
              styles.submitButton, 
              (!isFormValid || isSubmitting) && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={!isFormValid || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={[styles.submitButtonText, { marginLeft: 8 }]}>
                  Submitting...
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.submitButtonText}>
                  {isFormValid ? "Submit for Review" : "Fill Required Fields"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 20,
    paddingBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  placeholder: {
    width: 34,
  },
  keyboardContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: '#f5f5f5',
  },
  permissionText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginVertical: 20,
    lineHeight: 24,
    fontWeight: '500',
  },
  permissionButton: {
    backgroundColor: '#D32F2F',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  guidelinesContainer: {
    backgroundColor: '#fff3f3',
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
    margin: 15,
    padding: 15,
    borderRadius: 8,
  },
  guidelinesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  guidelinesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D32F2F',
    marginLeft: 6,
  },
  guidelinesText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  inputContainer: {
    backgroundColor: '#fff',
    margin: 15,
    borderRadius: 8,
    padding: 15,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  titleInput: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  contentInputContainer: {
    position: 'relative',
  },
  contentInput: {
    fontSize: 16,
    color: '#333',
    minHeight: 120,
    maxHeight: 200,
    paddingVertical: 10,
    paddingBottom: 50,
    textAlignVertical: 'top',
  },
  toolbar: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingVertical: 8,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginRight: 10,
  },
  toolbarButtonText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 5,
  },
  photoPreviewContainer: {
    backgroundColor: '#fff',
    margin: 15,
    marginTop: 0,
    borderRadius: 8,
    padding: 15,
    position: 'relative',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  statusContainer: {
    backgroundColor: '#f0f0f0',
    margin: 15,
    padding: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  submitContainer: {
    backgroundColor: '#fff',
    padding: 15,
    paddingBottom: Platform.OS === 'ios' ? 30 : 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginBottom: Platform.OS === 'ios' ? 0 : 90,
  },
  submitButton: {
    backgroundColor: '#D32F2F',
    borderRadius: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
    textAlign: 'center',
  },
  // Camera styles
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cameraHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cameraTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  cameraControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 60,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  captureContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#D32F2F',
  },
  cameraInstructions: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
  },
});

export default CreateForumPost;