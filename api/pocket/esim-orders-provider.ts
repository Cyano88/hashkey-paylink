const ORIGIN = 'https://api.esimaccess.com/api/v1/open'
export type EsimSupplierOrder = { transactionId: string; packageCode: string; days: number; daily: boolean; supplierUnitPrice: number; supplierAmount: number }

export function createEsimOrderProvider({ accessCode, fetchImpl = fetch }: { accessCode: string; fetchImpl?: typeof fetch }) {
  async function request(path: string, body: unknown) {
    if (!accessCode) throw Error('ESIM_NOT_CONFIGURED')
    const res = await fetchImpl(ORIGIN + path, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'RT-AccessCode': accessCode }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw Error('ESIM_PROVIDER_UNAVAILABLE')
    const value = await res.json()
    if (value?.success !== true) throw Error('ESIM_PROVIDER_UNAVAILABLE')
    return value.obj
  }
  return {
    async order(input: EsimSupplierOrder) {
      const result = await request('/esim/order', { transactionId: input.transactionId, amount: input.supplierAmount, packageInfoList: [{ packageCode: input.packageCode, count: 1, price: input.supplierUnitPrice, ...(input.daily ? { periodNum: input.days } : {}) }] })
      if (typeof result?.orderNo !== 'string' || !result.orderNo || (result.transactionId && result.transactionId !== input.transactionId)) throw Error('ESIM_ORDER_UNRESOLVED')
      return result.orderNo as string
    },
    async topUp(input: { transactionId: string; iccid: string; esimTranNo?: string; packageCode: string; amount: number; daily: boolean; days: number }) {
      if (!/^\d{10,22}$/.test(input.iccid) || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.packageCode)) throw Error('ESIM_TOPUP_INVALID')
      const result = await request('/esim/topup', { transactionId: input.transactionId, iccid: input.iccid, ...(input.esimTranNo ? { esimTranNo: input.esimTranNo } : {}), packageCode: input.packageCode, amount: input.amount, ...(input.daily ? { periodNum: input.days } : {}) })
      if (result.iccid !== input.iccid || !Number.isSafeInteger(result.totalVolume) || !Number.isSafeInteger(result.orderUsage) || typeof result.expiredTime !== 'string') throw Error('ESIM_TOPUP_UNRESOLVED')
      return result as { transactionId: string; iccid: string; totalVolume: number; orderUsage: number; expiredTime: string; totalDuration?: number }
    },
    async profiles(orderNo: string) {
      if (!orderNo) throw Error('ESIM_ORDER_REQUIRED')
      const result = await request('/esim/query', { orderNo, pager: { pageNum: 1, pageSize: 10 } })
      if (!Array.isArray(result?.esimList)) throw Error('ESIM_PROVIDER_UNAVAILABLE')
      return result.esimList.filter((row: any) => row.orderNo === orderNo).map((row: any) => ({
        iccid: String(row.iccid || ''), esimTranNo: String(row.esimTranNo || ''), activationCode: String(row.ac || ''), status: String(row.esimStatus || ''),
        apn: typeof row.apn === 'string' ? row.apn.trim() : '', smdpStatus: String(row.smdpStatus || ''),
        totalVolume: Number(row.totalVolume) || 0, usedVolume: Number(row.orderUsage) || 0, expiresAt: String(row.expiredTime || ''),
        topUpCount: Array.isArray(row.packageList) ? Math.max(0, row.packageList.length - 1) : 0,
      })) as { iccid: string; esimTranNo: string; activationCode: string; status: string; apn: string; smdpStatus: string; totalVolume: number; usedVolume: number; expiresAt: string; topUpCount: number }[]
    },
  }
}
