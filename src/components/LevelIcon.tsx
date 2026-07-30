// koyomi_prototype_5.html の hamsterIcon/dogIcon/hyenaIcon/tigerIcon を
// react-native-svg でそのまま移植したもの（カスタム画像未設定時のフォールバック表示）。
import React from 'react';
import Svg, { Ellipse, Circle, Path, G } from 'react-native-svg';
import { LevelKey } from '../theme/theme';

function Hamster({ color }: { color: string }) {
  return (
    <G fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round">
      <Ellipse cx={50} cy={52} rx={30} ry={26} />
      <Circle cx={26} cy={34} r={8} />
      <Circle cx={74} cy={34} r={8} />
      <Ellipse cx={30} cy={58} rx={10} ry={8} />
      <Ellipse cx={70} cy={58} rx={10} ry={8} />
      <Circle cx={40} cy={48} r={2.2} fill={color} />
      <Circle cx={60} cy={48} r={2.2} fill={color} />
      <Path d="M46,58 Q50,62 54,58" />
      <Path d="M50,58 L50,54" />
    </G>
  );
}

function Dog({ color }: { color: string }) {
  return (
    <G fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round">
      <Path d="M22,38 Q14,20 30,20" />
      <Path d="M78,38 Q86,20 70,20" />
      <Ellipse cx={50} cy={50} rx={32} ry={28} />
      <Ellipse cx={50} cy={62} rx={12} ry={8} />
      <Path d="M50,58 L50,64" />
      <Circle cx={39} cy={46} r={3} fill={color} />
      <Circle cx={61} cy={46} r={3} fill={color} />
      <Path d="M40,60 Q50,68 60,60" />
    </G>
  );
}

function Hyena({ color }: { color: string }) {
  return (
    <G fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round">
      <Path d="M24,36 L14,14 L34,26 Z" />
      <Path d="M76,36 L86,14 L66,26 Z" />
      <Ellipse cx={50} cy={52} rx={30} ry={26} />
      <Circle cx={30} cy={50} r={1.6} fill={color} />
      <Circle cx={40} cy={58} r={1.6} fill={color} />
      <Circle cx={70} cy={50} r={1.6} fill={color} />
      <Circle cx={60} cy={58} r={1.6} fill={color} />
      <Path d="M34,44 L44,42" />
      <Path d="M66,44 L56,42" />
      <Ellipse cx={50} cy={64} rx={10} ry={7} />
      <Path d="M42,64 Q50,72 58,64" strokeWidth={3} />
      <Path d="M46,66 L46,70 M54,66 L54,70" />
    </G>
  );
}

function Tiger({ color }: { color: string }) {
  return (
    <G fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round">
      <Path d="M26,32 Q18,16 34,20" />
      <Path d="M74,32 Q82,16 66,20" />
      <Ellipse cx={50} cy={52} rx={32} ry={27} />
      <Path d="M22,42 L32,45 M20,52 L31,53 M78,42 L68,45 M80,52 L69,53" />
      <Path d="M30,40 L38,40 M70,40 L62,40" strokeWidth={3} />
      <Path d="M36,50 L44,47 M64,50 L56,47" strokeWidth={3} />
      <Ellipse cx={50} cy={64} rx={11} ry={7} />
      <Path d="M39,63 Q50,54 61,63" strokeWidth={3} />
      <Path d="M44,64 L44,70 M50,65 L50,71 M56,64 L56,70" />
    </G>
  );
}

const ICONS: Record<LevelKey, React.FC<{ color: string }>> = {
  1: Hamster,
  2: Dog,
  3: Hyena,
  4: Tiger,
};

export default function LevelIcon({
  level,
  color,
  size = 72,
}: {
  level: LevelKey;
  color: string;
  size?: number;
}) {
  const Icon = ICONS[level];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Icon color={color} />
    </Svg>
  );
}
