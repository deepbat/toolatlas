export async function exerciseCataloguePaths(page,{base,evidence,check}){
 const {makeCatalogueFixture,checkCatalogueOutput}=await import('./page-catalogue.mjs'),{StandardFonts}=await import('pdf-lib'),{readFile,mkdir}=await import('node:fs/promises');
 const a=await makeCatalogueFixture('Alpha'),b=await makeCatalogueFixture('Beta',StandardFonts.Courier),common=['customer','approved','shared'];
 const upload=async(slug,files)=>{await page.goto(`${base}/tools/${slug}/`);await page.locator('input[type=file]').first().setInputFiles(files.map(([name,buffer])=>({name,mimeType:'application/pdf',buffer})));await page.getByText(files[0][0],{exact:true}).first().waitFor();};
 const download=async(button,path)=>{const pending=page.waitForEvent('download');await button.click();await(await pending).saveAs(path);return readFile(path);};
 await mkdir(evidence.slice(0,evidence.lastIndexOf('/'))||'.',{recursive:true});
 await upload('pdf-merge',[['alpha.pdf',a],['beta.pdf',b]]);
 const merged=await download(page.getByRole('button',{name:'Merge 2 files',exact:true}),`${evidence}-merge.pdf`);
 await checkCatalogueOutput([a,b],merged,[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]],{fields:[...common,'choice','person.name','omittedSecret',...common.map(n=>n+' (2)'),'choice (2)','person (2).name','omittedSecret (2)'],attachments:2,bookmarks:6,bookmarkPages:[1,0,2,4,3,5]});check('merge');
 await upload('pdf-split',[['alpha.pdf',a]]);await page.getByLabel('Split by',{exact:true}).selectOption('ranges');await page.getByLabel('Ranges, one file each',{exact:true}).fill('1');await page.getByRole('button',{name:'Split PDF',exact:true}).click();
 const split=await download(page.getByRole('button',{name:'Download this file',exact:true}),`${evidence}-split.pdf`);
 await checkCatalogueOutput([a],split,[[0,0]],{fields:common,attachments:1,omitSecret:true,bookmarks:1,bookmarkPages:[0]});check('split');
 await upload('pdf-delete-pages',[['alpha.pdf',a]]);await page.getByLabel('Pages to delete',{exact:true}).fill('3');
 const deleted=await download(page.getByRole('button',{name:'Delete pages',exact:true}),`${evidence}-delete.pdf`);
 await checkCatalogueOutput([a],deleted,[[0,0],[0,1]],{fields:[...common,'choice','person.name'],attachments:1,omitSecret:true,bookmarks:2,bookmarkPages:[1,0]});check('delete prunes excluded fields and destinations');
 await upload('pdf-page-organiser',[['alpha.pdf',a]]);await page.getByLabel('New page order',{exact:true}).fill('2,1,1');
 const reordered=await download(page.getByRole('button',{name:'Reorder pages',exact:true}),`${evidence}-reorder.pdf`);
 await checkCatalogueOutput([a],reordered,[[0,1],[0,0],[0,0]],{fields:[...common,'choice','person.name',...common.map(n=>n+' (2)')],attachments:1,omitSecret:true,bookmarks:2,bookmarkPages:[0,1]});check('reorder and duplicate');
}
