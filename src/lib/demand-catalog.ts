import type {ToolMeta} from './types';
export const DEMAND_TOOLS:ToolMeta[]=[
{id:'zip-create',name:'Create ZIP',description:'Bundle files into one ZIP archive locally. Stored without compression.',category:'file',icon:'Files',keywords:['zip','archive','combine','bundle','folder','files']},
{id:'image-base64',name:'Image to Base64',description:'Turn a PNG, JPEG or WebP image into a data URL for HTML and CSS.',category:'image',icon:'Image',keywords:['base64','data uri','data url','encode image','html','css']},
{id:'screen-test',name:'Screen Colour Test',description:'Inspect solid colours for dead pixels, stuck pixels and uneven brightness.',category:'misc',icon:'Monitor',keywords:['dead pixel','screen','lcd','monitor','display','colour','test']},
].map(t=>({...t,version:'1.0.0',status:'stable',added:'2026-11-13',layout:'wide'})) as ToolMeta[];
