import React, { useEffect } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { announce } from '../utils/announce';

// An error under a form. Without the announcement a screen reader user who
// just pressed the button hears nothing, and has no reason to go looking.
export function FormError({ message, style }: { message: string; style: StyleProp<TextStyle> }) {
  useEffect(() => {
    announce(message);
  }, [message]);

  return (
    <Text style={style} accessibilityRole="alert">
      {message}
    </Text>
  );
}
