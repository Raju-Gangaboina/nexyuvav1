'use client';
import UIModeToggle from './UIMode';

// This component now drives the real Arcade <-> Classic UI switch
// (previously a dark/light toggle; dark mode itself stays removed —
// "Classic" is the old glass/voxel look, "Arcade" is the pixel-arcade
// redesign). Kept the same name/import path so existing usages in the
// admin/company/student layouts don't need to change.
export default function ThemeToggle(props: { style?: React.CSSProperties }) {
  return <UIModeToggle style={props.style} />;
}
