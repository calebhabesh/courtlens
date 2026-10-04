import { describe, expect, it, vi, afterEach } from "vitest";
import { canSaveTurn, makeSaveRequest, saveOperation } from "./saved-operations";
import type { Turn } from "./conversation";
const turn = {status:"answered",manifest:{retained:true},results:[{data:{secret:"client results"}}],conversation_id:"conversation",turn_id:"turn",context_fingerprint:"fingerprint",interpretation:"provider prose"} as unknown as Turn;
afterEach(()=>vi.unstubAllGlobals());
describe("explicit operation retention boundary",()=>{
  it("sends only server identity, title and independent question opt-in", async()=>{
    const request=makeSaveRequest(turn,"Observed variation",false,"retry-id");
    expect(request).toEqual({request_id:"retry-id",conversation_id:"conversation",turn_id:"turn",context_fingerprint:"fingerprint",title:"Observed variation",include_question:false});
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"retained"})});vi.stubGlobal("fetch",fetch);
    await saveOperation(request);await saveOperation(request);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect(fetch.mock.calls[0][1].cache).toBe("no-store");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty("results");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty("question");
  });
  it("requires executed evidence and a supported retention state",()=>{
    for(const status of ["answered","no_data","insufficient_sample"] as const)expect(canSaveTurn({...turn,status})).toBe(true);
    for(const status of ["clarification_required","unsupported","disabled","provider_error","timeout","busy"] as const)expect(canSaveTurn({...turn,status})).toBe(false);
    expect(canSaveTurn({...turn,manifest:null})).toBe(false);expect(canSaveTurn({...turn,results:[]})).toBe(false);
  });
});
