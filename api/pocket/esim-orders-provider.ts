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
    async profiles(orderNo: string) {
      if (!orderNo) throw Error('ESIM_ORDER_REQUIRED')
      const result = await request('/esim/query', { orderNo, pager: { pageNum: 1, pageSize: 10 } })
      if (!Array.isArray(result?.esimList)) throw Error('ESIM_PROVIDER_UNAVAILABLE')
      return result.esimList.filter((row: any) => row.orderNo === orderNo).map((row: any) => ({
        iccid: String(row.iccid || ''), activationCode: String(row.ac || ''), status: String(row.esimStatus || ''),
        totalVolume: Number(row.totalVolume) || 0, usedVolume: Number(row.orderUsage) || 0, expiresAt: String(row.expiredTime || ''),
      })) as { iccid: string; activationCode: string; status: string; totalVolume: number; usedVolume: number; expiresAt: string }[]
    },
  }
}
