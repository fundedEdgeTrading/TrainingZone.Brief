import { Component, type ReactNode } from "react";
import { Image, View, type StyleProp, type ImageStyle } from "react-native";

type Props = {
  uri: string;
  style: StyleProp<ImageStyle>;
  backgroundColor: string;
};

type State = { hasError: boolean };

/**
 * Las fotos de progreso pueden venir como data URI (subidas desde la web sin
 * backend de almacenamiento) y React Native puede fallar al renderizarlas si
 * son muy pesadas. Sin este boundary, ese fallo tira toda la pantalla.
 */
class ImageErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function SafePhoto({ uri, style, backgroundColor }: Props) {
  return (
    <ImageErrorBoundary fallback={<View style={[style, { backgroundColor }]} />}>
      <Image source={{ uri }} style={[style, { backgroundColor }]} onError={() => {}} />
    </ImageErrorBoundary>
  );
}
