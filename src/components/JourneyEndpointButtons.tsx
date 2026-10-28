import {useViewStore} from '../store/viewStore'
export function JourneyEndpointButtons({id,cityId,source}:{id:string;cityId:string;source:'snapshot'|'project'}){
 return <div className="journey-endpoints"><button type="button" onClick={()=>useViewStore.getState().requestEndpoint({end:'from',id,cityId,source})}>设为起点</button><button type="button" onClick={()=>useViewStore.getState().requestEndpoint({end:'to',id,cityId,source})}>设为终点</button></div>
}
