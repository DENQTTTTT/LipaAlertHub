// components/FloatingChatButton.tsx - Floating Chat Button Component
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { ChatModal } from '../app/(main)/chat';
import { useAuth } from '../hooks/useAuth';
import { chatService } from '../services/chat';

const { width, height } = Dimensions.get('window');

interface FloatingChatButtonProps {
  bottom?: number;
  right?: number;
}

export const FloatingChatButton: React.FC<FloatingChatButtonProps> = ({
  bottom = 20,
  right = 20,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);
  const { user } = useAuth();
  
  const scaleAnim = new Animated.Value(1);
  const pulseAnim = new Animated.Value(1);

  useEffect(() => {
    if (!user) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    checkUnreadMessages();

    // Check for unread messages periodically
    const interval = setInterval(checkUnreadMessages, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (unreadCount > 0 && !isPulsing) {
      startPulseAnimation();
    } else if (unreadCount === 0) {
      setIsPulsing(false);
    }
  }, [unreadCount]);

  const checkUnreadMessages = async () => {
    try {
      const count = await chatService.getUnreadMessageCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Error checking unread messages:', error);
    }
  };

  const startPulseAnimation = () => {
    setIsPulsing(true);
    
    const pulse = () => {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (isPulsing && unreadCount > 0) {
          pulse();
        }
      });
    };
    
    pulse();
  };

  const handlePress = () => {
    // Scale animation on press
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    setIsChatOpen(true);
  };

  const handleCloseChat = () => {
    setIsChatOpen(false);
    // Refresh unread count when chat is closed
    setTimeout(() => {
      checkUnreadMessages();
    }, 1000);
  };

  if (!isVisible || !user) {
    return null;
  }

  return (
    <>
      <Animated.View
        style={[
          styles.container,
          {
            bottom,
            right,
            transform: [
              { scale: scaleAnim },
              { scale: isPulsing ? pulseAnim : 1 }
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.button}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          {/* Unread Badge */}
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount.toString()}
              </Text>
            </View>
          )}

          {/* Chat Icon */}
          <Ionicons 
            name="chatbubbles" 
            size={24} 
            color="#fff" 
          />

          {/* CDRRMO Label */}
          <Text style={styles.label}>CDRRMO</Text>
        </TouchableOpacity>

        {/* Tooltip for first-time users */}
        {unreadCount === 0 && (
          <View style={styles.tooltip}>
            <Text style={styles.tooltipText}>
              Chat with CDRRMO
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Chat Modal */}
      <ChatModal
        isVisible={isChatOpen}
        onClose={handleCloseChat}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 999,
  },
  button: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ff4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 1,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 8,
    color: '#fff',
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  tooltip: {
    position: 'absolute',
    right: 70,
    top: 15,
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    opacity: 0.9,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
  },
});

export default FloatingChatButton;