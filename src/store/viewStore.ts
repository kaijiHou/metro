import { create } from 'zustand'
import type { BrowseStation } from '../utils/browseGeojson'
import type {MetroProject} from '../models/metro'
import type {Journey} from '../utils/journey'

export type JourneyOverlay={project:MetroProject;journey:Journey;departure?:string}
export type EndpointRequest={end:'from'|'to';id:string;cityId:string;source:'snapshot'|'project'}

type ViewState = {
  page:'transit'|'travel'
  travelBusy:boolean
  setPage:(page:'transit'|'travel')=>void
  setTravelBusy:(travelBusy:boolean)=>void
  presentationMode:boolean
  autoNetworks:boolean
  existingOnly:boolean
  station:BrowseStation|null
  journey:JourneyOverlay|null
  endpointRequest:EndpointRequest|null
  setJourney:(journey:JourneyOverlay|null)=>void
  requestEndpoint:(endpointRequest:EndpointRequest|null)=>void
  setPresentationMode:(presentationMode:boolean)=>void
  setAutoNetworks:(autoNetworks:boolean)=>void
  setExistingOnly:(existingOnly:boolean)=>void
  setStation:(station:BrowseStation|null)=>void
}

// UI and read-only selection are intentionally outside project persistence/history.
export const useViewStore = create<ViewState>((set)=>({page:'transit',travelBusy:false,setPage:(page)=>set({page,station:null,journey:null,endpointRequest:null}),setTravelBusy:(travelBusy)=>set({travelBusy}),presentationMode:false,autoNetworks:true,existingOnly:false,station:null,
  journey:null,endpointRequest:null,setJourney:(journey)=>set(journey?{journey,station:null}:{journey}),requestEndpoint:(endpointRequest)=>set({endpointRequest}),
  setPresentationMode:(presentationMode)=>set({presentationMode,station:null}),
  setAutoNetworks:(autoNetworks)=>set({autoNetworks}),setExistingOnly:(existingOnly)=>set({existingOnly}),setStation:(station)=>set({station})}))
