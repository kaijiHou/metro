import type {StyleSpecification} from 'maplibre-gl'
// Footprints are a national/provincial outline atlas, separate from the detailed transit basemap.
export const footprintStyle:StyleSpecification={version:8,glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',sources:{},layers:[{id:'outline-background',type:'background',paint:{'background-color':'#081928'}}]}
