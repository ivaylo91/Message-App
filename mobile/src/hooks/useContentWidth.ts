import { useWindowDimensions } from 'react-native';
import { MAX_CONTENT_WIDTH } from '../theme/tokens';

export function useContentWidth() {
  const { width } = useWindowDimensions();
  return { windowWidth: width, contentWidth: Math.min(width, MAX_CONTENT_WIDTH) };
}