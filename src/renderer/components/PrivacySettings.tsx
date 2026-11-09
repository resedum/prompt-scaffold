import { useEffect, useState } from 'react'
import { bridge } from '../api/bridge'
import type { MemorySettings, CapabilityKey, AiScope, SendScope } from '../../shared/privacy-types'

const CAPS: { key: CapabilityKey; label: string }[] = [
  { key: 'enhance', label: '输入增强' },
  { key: 'summarize', label: 'AI 总结' },
  { key: 'remind', label: 'AI 提醒文案' },
  { key: 'codeExec', label: '代码执行' }
]

export default function PrivacySettings() {
  const [settings, setSettings] = useState<MemorySettings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    bridge.getPrivacy().then((r) => {
      if (r.ok) setSettings(r.data)
    })
  }, [])

  if (!settings) return <div className="p-4 text-sm text-gray-400">加载中…</div>

  const setCap = (key: CapabilityKey, scope: AiScope) => {
    setSettings({
      ...settings,
      privacy: { ...settings.privacy, capabilities: { ...settings.privacy.capabilities, [key]: scope } }
    })
  }

  const save = async () => {
    const r = await bridge.savePrivacy(settings)
    if (r.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } else {
      alert(r.message)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">隐私控制中心</h3>
            <p className="text-xs text-gray-400">默认关闭、数据不出机、你说了算</p>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={settings.privacy.masterAiKill}
              onChange={(e) => setSettings({ ...settings, privacy: { ...settings.privacy, masterAiKill: e.target.checked } })}
            />
            一键全关 AI 逃生舱
          </label>
        </div>

        <ul className="space-y-3">
          {CAPS.map((c) => (
            <li key={c.key} className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm">{c.label}</span>
                <div className="flex overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-600">
                  {(['off', 'local', 'external'] as AiScope[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setCap(c.key, s)}
                      disabled={settings.privacy.masterAiKill}
                      className={
                        'px-2 py-1 ' +
                        (settings.privacy.capabilities[c.key] === s
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700') +
                        (settings.privacy.masterAiKill ? ' opacity-50' : '')
                      }
                    >
                      {s === 'off' ? '关闭' : s === 'local' ? '本地' : '外部'}
                    </button>
                  ))}
                </div>
              </div>
              {settings.privacy.capabilities[c.key] === 'external' && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <span>发送范围：</span>
                  {(['all', 'selected'] as SendScope[]).map((s) => (
                    <label key={s} className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`send-${c.key}`}
                        checked={settings.privacy.sendScope === s}
                        onChange={() => setSettings({ ...settings, privacy: { ...settings.privacy, sendScope: s } })}
                      />
                      {s === 'all' ? '全部' : '仅选中'}
                    </label>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">出机动作前会二次确认发送内容，可取消</span>
          <button onClick={save} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
            {saved ? '已保存' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  )
}
