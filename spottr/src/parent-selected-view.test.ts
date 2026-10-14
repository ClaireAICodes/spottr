import { expect, test } from 'vitest'
import { createGymService, createMemoryGymRepository } from './gyms'
function gate(){ let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return {promise,resolve} }
test('parent selected view is pure and explicit maintenance repairs invalid selection', async()=>{
 const repository=createMemoryGymRepository();await repository.select('missing');let clears=0;const select=repository.select.bind(repository);repository.select=async id=>{if(id===null)clears++;await select(id)}
 const service=createGymService(repository);expect(await service.getSelected()).toBeNull();expect(await repository.getSelectedId()).toBe('missing');expect(clears).toBe(0)
 await service.repairInvalidSelection();expect(await repository.getSelectedId()).toBeNull();expect(clears).toBe(1)
})
test('parent explicit maintenance revalidates selection identity before clearing',async()=>{
 const repository=createMemoryGymRepository();await repository.select('missing');const read=repository.get.bind(repository);const entered=gate(),release=gate();repository.get=async id=>{if(id==='missing'){entered.resolve();await release.promise}return read(id)}
 const service=createGymService(repository);const repair=service.repairInvalidSelection();await entered.promise
 try {await repository.select('replacement')}finally{release.resolve()}
 await repair;expect(await repository.getSelectedId()).toBe('replacement')
})
