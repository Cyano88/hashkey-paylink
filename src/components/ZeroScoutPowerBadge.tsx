type ZeroScoutPowerBadgeProps = {
  compact?: boolean
}

export default function ZeroScoutPowerBadge({ compact = false }: ZeroScoutPowerBadgeProps) {
  return (
    <span className="zeroscout-power-badge">
      <span className={compact ? 'zeroscout-power-badge__mark zeroscout-power-badge__mark--compact' : 'zeroscout-power-badge__mark'}>
        <span className="zeroscout-power-badge__logo zeroscout-power-badge__logo--zs" aria-hidden="true">
          <span className="zeroscout-power-badge__fallback">ZS</span>
          <img
            src="/zeroscout-mark.png"
            alt=""
            aria-hidden="true"
            onError={event => {
              event.currentTarget.hidden = true
            }}
          />
        </span>
        <img className="zeroscout-power-badge__logo zeroscout-power-badge__logo--og" src="/brand/0g-logo.jpeg" alt="" aria-hidden="true" />
      </span>
      <span>Powered by ZeroScout</span>
    </span>
  )
}
