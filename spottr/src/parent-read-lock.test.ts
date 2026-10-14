import { expect, test } from 'vitest'
import { runRoot } from './datasetCoordinator'
function gate() { let resolve!: () => void; const promise = new Promise<void>(r => {resolve=r}); return {promise,resolve} }
test('parent scratch: overlapping pure reads, queued writer fairness and exclusive snapshot exclusion', async () => {
 const r1Entered=gate(),r1Release=gate(),r2Entered=gate(),r2Release=gate(),wEntered=gate(),wRelease=gate();const trace:string[]=[]
 const a=runRoot(async()=>{trace.push('r1-acquire');r1Entered.resolve();await r1Release.promise;trace.push('r1-release')},'shared');await r1Entered.promise
 const b=runRoot(async()=>{trace.push('r2-acquire');r2Entered.resolve();await r2Release.promise;trace.push('r2-release')},'shared');await r2Entered.promise
 trace.push('writer-request');const w=runRoot(async()=>{trace.push('writer-acquire');wEntered.resolve();await wRelease.promise;trace.push('writer-release')})
 trace.push('later-read-request');const c=runRoot(async()=>{trace.push('later-read-acquire')},'shared')
 try {
  expect(trace).not.toContain('writer-acquire');expect(trace).not.toContain('later-read-acquire')
  r1Release.resolve();await a;expect(trace).not.toContain('writer-acquire')
  r2Release.resolve();await b;await wEntered.promise;expect(trace).not.toContain('later-read-acquire')
 } finally {r1Release.resolve();r2Release.resolve();wRelease.resolve()}
 await Promise.all([a,b,w,c]);expect(trace.indexOf('writer-acquire')).toBeGreaterThan(trace.indexOf('r2-release'));expect(trace.indexOf('later-read-acquire')).toBeGreaterThan(trace.indexOf('writer-release'))
 console.log('ACKNOWLEDGED_TRACE',JSON.stringify(trace))
})
