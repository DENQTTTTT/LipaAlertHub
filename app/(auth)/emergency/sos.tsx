// app/(auth)/emergency/sos.tsx - SOS Slide to Confirm with Offline Support
import { useSOSSync } from '@/hooks/useSOSSync';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';

const { width, height } = Dimensions.get('window');
const SLIDER_WIDTH = width - 60;
const BUTTON_WIDTH = 60;
const SLIDER_HEIGHT = 60;

export default function SOSSlideToConfirm() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { isOnline, unsyncedCount } = useSOSSync();
  
  const [buttonPosition, setButtonPosition] = useState(0);
  const [buttonScale, setButtonScale] = useState(1);
  const [isSliding, setIsSliding] = useState(false);
  const [slideCompleted, setSlideCompleted] = useState(false);
  const [progressWidth, setProgressWidth] = useState(0);
  const [textOpacity, setTextOpacity] = useState(1);

  const maxSlide = SLIDER_WIDTH - BUTTON_WIDTH;

  // Pulse animation for SOS text
  useEffect(() => {
    const pulse = () => {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]).start(() => pulse());
    };
    pulse();
  }, []);

  // Auto-reset after 3 seconds of inactivity
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (isSliding && !slideCompleted) {
      timeoutId = setTimeout(() => {
        resetSlider();
      }, 3000);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isSliding, slideCompleted]);

  const resetSlider = () => {
    setButtonPosition(0);
    setButtonScale(1);
    setProgressWidth(0);
    setTextOpacity(1);
    setIsSliding(false);
    setSlideCompleted(false);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        if (!isSliding) {
          setIsSliding(true);
          Vibration.vibrate(30);
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const { dx } = gestureState;
        
        let constrainedDx = dx;
        if (dx < 0) {
          constrainedDx = 0;
        } else if (dx > maxSlide) {
          constrainedDx = maxSlide;
        }

        setButtonPosition(constrainedDx);
        
        const progress = (constrainedDx / maxSlide) * SLIDER_WIDTH;
        setProgressWidth(progress);

        const opacity = constrainedDx <= maxSlide * 0.5 ? 1 - (constrainedDx / (maxSlide * 0.5)) * 0.7 : 0.3;
        setTextOpacity(opacity);

        const completionThreshold = maxSlide * 0.90;
        if (constrainedDx >= completionThreshold && !slideCompleted) {
          setSlideCompleted(true);
          setButtonScale(1.1);
          Vibration.vibrate([80, 40, 80]);
        } else if (constrainedDx < completionThreshold && slideCompleted) {
          setSlideCompleted(false);
          setButtonScale(1);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        const { dx } = gestureState;
        
        if (dx >= maxSlide * 0.85) {
          setButtonPosition(maxSlide);
          setProgressWidth(SLIDER_WIDTH);
          setTextOpacity(0.3);
          setButtonScale(1.1);
          
          Vibration.vibrate([150, 80, 150]);
          
          setTimeout(() => {
            try {
              console.log("Navigating to SOS services...");
              router.replace('/emergency/sos-services');
            } catch (error) {
              console.error("Navigation error:", error);
              router.push('/emergency/sos-services');
            }
          }, 200);
        } else {
          resetSlider();
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#d73527" />
      
      {/* Header with Logo */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../../assets/images/logo.png')} 
            style={styles.logoImage}
          />
          <Text style={styles.logoTitle}>LipaAlertHub</Text>
        </View>
      </View>

      {/* Connection Status Indicator */}
      {(!isOnline || unsyncedCount > 0) && (
        <View style={styles.statusBanner}>
          {!isOnline ? (
            <Text style={styles.statusText}>⚠️ Offline Mode - SOS will still work</Text>
          ) : unsyncedCount > 0 ? (
            <Text style={styles.statusText}>📤 Syncing {unsyncedCount} SOS log{unsyncedCount > 1 ? 's' : ''}...</Text>
          ) : null}
        </View>
      )}

      {/* Main Content */}
      <View style={styles.mainContent}>
        <Animated.Text style={[styles.sosTitle, { transform: [{ scale: pulseAnim }] }]}>
          SOS
        </Animated.Text>

        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionText}>Emergency assistance needed</Text>
          <Text style={styles.instructionSubtext}>Slide to access emergency services</Text>
          {!isOnline && (
            <Text style={styles.offlineNote}>Will sync when connection restored</Text>
          )}
        </View>

        {/* Slide to Confirm */}
        <View style={styles.sliderContainer}>
          <View style={[styles.progressBar, { width: progressWidth }]} />
          
          <View style={[styles.textContainer, { opacity: textOpacity }]}>
            <Text style={styles.slideIcon}>🚨</Text>
            <Text style={styles.slideText}>SLIDE TO CONFIRM</Text>
          </View>

          <View
            style={[
              styles.sliderButton,
              {
                transform: [
                  { translateX: buttonPosition },
                  { scale: buttonScale },
                ],
              },
            ]}
            {...panResponder.panHandlers}
          >
            <Text style={styles.buttonArrow}>▶</Text>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#d73527",
  },
  header: {
    paddingHorizontal: width * 0.05,
    paddingBottom: height * 0.02,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoImage: {
    width: width * 0.08,
    height: width * 0.08,
    borderRadius: 8,
    marginRight: width * 0.025,
    resizeMode: 'contain',
  },
  logoTitle: {
    fontSize: width * 0.045,
    fontWeight: "600",
    color: "#ffffff",
  },
  statusBanner: {
    backgroundColor: "rgba(0,0,0,0.3)",
    marginHorizontal: width * 0.05,
    paddingVertical: height * 0.012,
    paddingHorizontal: width * 0.04,
    borderRadius: 8,
    marginBottom: height * 0.02,
  },
  statusText: {
    color: "#ffffff",
    fontSize: width * 0.032,
    textAlign: "center",
    fontWeight: "500",
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: width * 0.08,
  },
  sosTitle: {
    fontSize: Math.min(width * 0.28, height * 0.15),
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: width * 0.04,
    textAlign: 'center',
    marginBottom: height * 0.04,
  },
  instructionsContainer: {
    alignItems: 'center',
    marginBottom: height * 0.06,
  },
  instructionText: {
    fontSize: width * 0.042,
    color: "#ffffff",
    textAlign: 'center',
    fontWeight: "500",
    marginBottom: height * 0.01,
  },
  instructionSubtext: {
    fontSize: width * 0.035,
    color: "#ffffff",
    textAlign: 'center',
    fontWeight: "400",
    opacity: 0.9,
  },
  offlineNote: {
    fontSize: width * 0.03,
    color: "#ffffff",
    textAlign: 'center',
    fontWeight: "400",
    opacity: 0.8,
    marginTop: height * 0.008,
    fontStyle: 'italic',
  },
  sliderContainer: {
    width: SLIDER_WIDTH,
    height: SLIDER_HEIGHT,
    backgroundColor: '#ffffff',
    borderRadius: SLIDER_HEIGHT / 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    backgroundColor: '#ffebee',
    borderRadius: SLIDER_HEIGHT / 2,
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideIcon: {
    fontSize: width * 0.04,
    marginRight: width * 0.02,
  },
  slideText: {
    fontSize: width * 0.035,
    fontWeight: '600',
    color: '#d73527',
    letterSpacing: 0.5,
  },
  sliderButton: {
    position: 'absolute',
    left: height * 0.006,
    width: BUTTON_WIDTH - height * 0.012,
    height: SLIDER_HEIGHT - height * 0.012,
    backgroundColor: '#d73527',
    borderRadius: (SLIDER_HEIGHT - height * 0.012) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonArrow: {
    fontSize: width * 0.045,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  bottomSpacing: {
    height: height * 0.15,
  },
});