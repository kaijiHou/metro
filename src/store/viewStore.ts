import { create } from 'zustand'
import type { BrowseStation } from '../utils/browseGeojson'

type ViewState = {
  page:'transit'|'travel'
  travelBusy:boolean
  setPage:(page:'transit'|'travel')=>void
  setTravelBusy:(travelBusy:boolean)=>void
  presentationMode:boolean
  autoNetworks:boolean
  existingOnly:boolean
  station:BrowseStation|null
  setPresentationMode:(presentationMode:boolean)=>void
  setAutoNetworks:(autoNetworks:boolean)=>void
  setExistingOnly:(existingOnly:boolean)=>void
  setStation:(station:BrowseStation|null)=>void
}

// UI and read-only selection are intentionally outside project persistence/history.
export const useViewStore = create<ViewState>((set)=>({page:'transit',travelBusy:false,setPage:(page)=>set({page,station:null}),setTravelBusy:(travelBusy)=>set({travelBusy}),presentationMode:false,autoNetworks:true,existingOnly:false,station:null,
  setPresentationMode:(presentationMode)=>set({presentationMode,station:null}),
  setAutoNetworks:(autoNetworks)=>set({autoNetworks}),setExistingOnly:(existingOnly)=>set({existingOnly}),setStation:(station)=>set({station})}))
