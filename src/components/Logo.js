function Logo({
  height = 40,
  showWordmark = true,
  color = "#212529",
  outlineColor = "#ffffff",
  textColor = "#212529",
}) {
  return (
    <svg
      height={height}
      viewBox={showWordmark ? "0 0 680 220" : "0 0 260 220"}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Watch & Wonder"
    >
      <title>Watch &amp; Wonder</title>

      <rect
        x="62"
        y="42"
        width="136"
        height="136"
        rx="26"
        fill={color}
        stroke={outlineColor}
        strokeWidth="3"
      />
      <path d="M108 78 L152 110 L108 142 Z" fill="#ffffff" />
      <path
        d="M158 62 L164 76 L178 82 L164 88 L158 102 L152 88 L138 82 L152 76 Z"
        fill="#ffffff"
      />

      {showWordmark && (
        <>
          <text
            x="222"
            y="98"
            fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
            fontSize="40"
            fontWeight="700"
            fill={textColor}
          >
            Watch
          </text>
          <text
            x="222"
            y="146"
            fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
            fontSize="40"
            fontWeight="700"
            fill={textColor}
          >
            &amp; Wonder
          </text>
        </>
      )}
    </svg>
  );
}

export default Logo;