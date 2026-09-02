import { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

const PALETTE = [
  "#f59e0b",
  "#22d3ee",
  "#a78bfa",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#60a5fa",
];

interface Particle {
  id: number;
  angle: number;
  distance: number;
  size: number;
  color: string;
}

function buildParticles(): Particle[] {
  const particles: Particle[] = [];
  let id = 0;
  const bursts = 3;
  for (let b = 0; b < bursts; b++) {
    const count = 14;
    const base = (b * Math.PI * 2) / 3;
    const radius = 90 + b * 26;
    for (let i = 0; i < count; i++) {
      const angle = base + (i / count) * Math.PI * 2 + b * 0.3;
      particles.push({
        id: id++,
        angle,
        distance: radius + Math.random() * 26,
        size: 6 + Math.random() * 5,
        color: PALETTE[(id + b) % PALETTE.length],
      });
    }
  }
  return particles;
}

function Rocket({ particle }: { particle: Particle }) {
  const progress = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    const dx = Math.cos(particle.angle) * particle.distance * progress.value;
    const dy = Math.sin(particle.angle) * particle.distance * progress.value;
    return {
      transform: [
        { translateX: dx },
        { translateY: dy },
        { scale: 1 - progress.value * 0.4 },
      ],
      opacity: 1 - progress.value,
    };
  });

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 1000,
      easing: Easing.out(Easing.quad),
    });
  }, [progress]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: particle.size,
          height: particle.size,
          borderRadius: particle.size / 2,
          backgroundColor: particle.color,
        },
        style,
      ]}
    />
  );
}

export default function Fireworks({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [particles] = useState(() => buildParticles());
  const doneRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onComplete();
      }
    }, 1150);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <View
      style={styles.overlay}
      className="absolute inset-0 items-center justify-center"
      pointerEvents="none"
    >
      <View style={styles.center}>
        {particles.map((p) => (
          <Rocket key={p.id} particle={p} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 50,
  },
  center: {
    position: "relative",
    width: 1,
    height: 1,
  },
  dot: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
