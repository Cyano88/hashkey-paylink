type ZeroScoutPowerBadgeProps = {
  compact?: boolean
}

export default function ZeroScoutPowerBadge({ compact = false }: ZeroScoutPowerBadgeProps) {
  return (
    <span className="zeroscout-power-badge">
      <span className={compact ? 'zeroscout-power-badge__mark zeroscout-power-badge__mark--compact' : 'zeroscout-power-badge__mark'}>
        <img className="zeroscout-power-badge__logo zeroscout-power-badge__logo--zs" src="/zeroscout-mark.png" alt="" aria-hidden="true" />
      </span>
      <span>Powered by ZeroScout</span>
    </span>
  )
}
