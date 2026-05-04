import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  isRecording: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function RecordButton({ isRecording, disabled, onPress }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isRecording) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.18,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.halo,
          {
            transform: [{ scale: pulse }],
            opacity: isRecording ? 0.35 : 0,
          },
        ]}
      />
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.button,
          isRecording && styles.buttonRecording,
          disabled && styles.buttonDisabled,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.icon}>{isRecording ? '■' : '🎤'}</Text>
      </Pressable>
      <Text style={styles.label}>
        {isRecording ? 'Listening… tap to stop' : 'Tap and start singing'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  halo: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#a855f7',
  },
  button: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonRecording: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  buttonDisabled: {
    backgroundColor: '#3a3a4a',
    shadowOpacity: 0,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  icon: {
    fontSize: 44,
    color: '#fff',
  },
  label: {
    marginTop: 16,
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '500',
  },
});
