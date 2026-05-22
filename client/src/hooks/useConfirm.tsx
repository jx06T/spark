import { useState, useCallback, useRef } from 'react'
import { ConfirmModal } from '../components/ConfirmModal'

export function useConfirm() {
  const [config, setConfig] = useState<{ message: string } | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      resolverRef.current = resolve
      setConfig({ message })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolverRef.current?.(true)
    setConfig(null)
  }, [])

  const handleCancel = useCallback(() => {
    resolverRef.current?.(false)
    setConfig(null)
  }, [])

  const modal = config ? (
    <ConfirmModal message={config.message} onConfirm={handleConfirm} onCancel={handleCancel} />
  ) : null

  return { confirm, modal }
}
