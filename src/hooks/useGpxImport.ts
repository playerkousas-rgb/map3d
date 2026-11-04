import { useLayoutEffect, useRef } from "react";
import { parseGpx, readGpxFile, type GpxTrack } from "@/utils/gpx";

/** Latest selection wins; a committed mode/view change aborts old byte reads. */
export function useGpxImport(active: boolean, onTrack: (track:GpxTrack)=>void, onError:(code:string|null)=>void) {
  const generation=useRef(0),activeRef=useRef(active),pending=useRef<AbortController|null>(null);
  useLayoutEffect(()=>{
    const revision=generation;
    activeRef.current=active;revision.current++;
    return ()=>{activeRef.current=false;revision.current++;pending.current?.abort();};
  },[active]);
  return async(file:File)=>{
    if(!activeRef.current)return;
    pending.current?.abort();const controller=new AbortController();pending.current=controller;
    const revision=++generation.current;
    const current=()=>activeRef.current&&generation.current===revision&&!controller.signal.aborted&&!window.location.hash.startsWith("#play=");
    onError(null);
    try{
      const text=await readGpxFile(file,controller.signal);
      if(!current())return;
      const track=parseGpx(text);
      if(current())onTrack(track);
    }catch(error){
      if(current())onError(error instanceof Error?error.message:"GPX_INVALID");
    }finally{if(pending.current===controller)pending.current=null;}
  };
}
