import React, { useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, type LayoutChangeEvent, type DimensionValue } from 'react-native';
import { colors } from '../theme/theme';

type Props = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onValueChange: (value: number) => void;
};

export default function FareSlider({ value, minimumValue, maximumValue, step = 500, onValueChange }: Props) {
  const trackRef = useRef<View>(null);
  const trackX = useRef(0);
  const trackWidth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const clampStep = (raw: number) => {
    const range = Math.max(1, maximumValue - minimumValue);
    const ratio = Math.min(1, Math.max(0, (raw - minimumValue) / range));
    const stepped = Math.round(ratio * (range / step)) * step;
    return Math.max(minimumValue, Math.min(maximumValue, minimumValue + stepped));
  };

  const setFromWindowX = (x: number) => {
    if (trackWidth.current <= 0) return;
    const ratio = (x - trackX.current) / trackWidth.current;
    onValueChange(clampStep(minimumValue + ratio * (maximumValue - minimumValue)));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setDragging(true);
        trackRef.current?.measureInWindow((x) => {
          trackX.current = x;
          setFromWindowX(x);
        });
      },
      onPanResponderMove: (_evt, gesture) => {
        if (trackX.current === 0 && trackWidth.current > 0) {
          trackRef.current?.measureInWindow((x) => {
            trackX.current = x;
          });
        }
        setFromWindowX(gesture.moveX);
      },
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  const range = Math.max(1, maximumValue - minimumValue);
  const ratio = Math.min(1, Math.max(0, (value - minimumValue) / range));
  const thumbLeft = `${ratio * 100}%` as DimensionValue;

  return (
    <View
      ref={trackRef}
      style={styles.track}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      <View
        style={[styles.fill, { width: thumbLeft }]}
        pointerEvents="none"
      />
      <View style={[styles.thumb, { left: thumbLeft }, dragging && styles.thumbActive]} pointerEvents="none">
        <View style={styles.thumbCore} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 36,
    justifyContent: 'center',
    backgroundColor: colors.gray200,
    borderRadius: 6,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    width: 36,
    height: 36,
    marginLeft: -18,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  thumbActive: { transform: [{ scale: 1.12 }] },
  thumbCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.white,
  },
});
