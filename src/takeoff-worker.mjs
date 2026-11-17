import {calculate} from './takeoff.mjs';
self.onmessage=({data})=>{try{self.postMessage({result:calculate(data.drawing,data.state)});}catch(error){self.postMessage({error:error.message});}};
