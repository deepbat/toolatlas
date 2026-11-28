import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const requiredJobs=['Windows installer (unsigned)','Linux build (secondary)','Linux smoke test (xvfb, screenshot)','Windows smoke test (install, launch, screenshot)'];
export function validateRelease({run,jobs,artifacts,repository,mainSha,tag,dispatchRef}){
 assert.equal(dispatchRef,'refs/heads/main','Release must be dispatched from main');
 assert.match(tag,/^desktop-[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,'Use a desktop- release tag');
 assert.equal(run.repository?.full_name,repository,'Run belongs to another repository');
 assert.equal(run.path,'.github/workflows/desktop.yml','Not the build-only desktop workflow');
 assert.equal(run.event,'workflow_dispatch','Not a manually requested desktop build');
 assert.equal(run.head_branch,'main','Desktop build must come from main');
 assert.equal(run.head_sha,mainSha,'Build is not the current main commit');
 assert.match(mainSha,/^[a-f0-9]{40}$/,'Invalid source commit');
 assert.equal(run.status,'completed','Desktop build is not complete');
 assert.equal(run.conclusion,'success','Desktop build did not succeed');
 for(const name of requiredJobs){const matches=jobs.filter(j=>j.name===name);assert.equal(matches.length,1,'Missing or ambiguous job: '+name);assert.equal(matches[0].status,'completed',name+' is not complete');assert.equal(matches[0].conclusion,'success',name+' did not succeed');}
 const matches=artifacts.filter(a=>a.name==='deepaks-tool-windows-unsigned');assert.equal(matches.length,1,'Expected exactly one production installer artifact');
 const artifact=matches[0];assert.equal(artifact.expired,false,'Installer artifact expired');assert.equal(artifact.workflow_run?.head_sha,mainSha,'Artifact source does not match build');
 assert.match(artifact.digest,/^sha256:[a-f0-9]{64}$/,'Artifact has no usable SHA-256');
 assert.ok(Number.isSafeInteger(artifact.id)&&artifact.id>0,'Invalid artifact id');
 return artifact;
}
export function releaseNotes({run,installerSha,filename}){
 return `# Deepak's Tool for Windows\n\nUnsigned Windows installer. Windows may show an unknown-publisher warning. This build has passed installation and functional checks on GitHub-hosted Windows, including the production app. It is not a promise that every PDF or Office document converts perfectly.\n\nFiles are processed on the device. No account or paid service is needed.\n\n## Tested coverage and limits\n\n- The PDF suite includes editing, merge/split/extract/reorder, compression, PDF and Office conversions, OCR, forms, visible image signatures, page labels/layout, protection/unlock and repair.\n- Printed English, Hindi and Punjabi OCR are available. OCR can misread text. Check important words against the page. Handwriting is not supported.\n- Hindi/Punjabi image-backed output carries a Unicode search/copy layer with verified full-word selection widths in tested paths. Other browser-print and Office selectable text paths can still copy incorrectly.\n- Word/Excel and PDF-to-Word conversions do not preserve every layout, font, chart, vector drawing or complex table. Check converted documents against their originals.\n- Signature images are not cryptographic digital signatures. Editing a digitally signed PDF invalidates its signature. Cropped page arrangement and redaction have the rasterization limits shown in the tools.\n- Standard AcroForm fields, bookmarks, links and attachments are retained by the tested page operations. XFA forms are not supported by page assembly. Attachments may retain information beyond selected pages, so check them before sharing.\n\n## Provenance\n\nSource commit: ${run.head_sha}\nVerified build: ${run.html_url}\nInstaller: ${filename}\nInstaller SHA-256: ${installerSha}\n\nCompare the downloaded installer with SHA256SUMS.txt. This unsigned build does not claim full Sejda-equivalent conversion fidelity.\n`;
}
async function main(){
 const repository=process.env.GITHUB_REPOSITORY,runId=process.env.RELEASE_RUN_ID,tag=process.env.RELEASE_TAG;
 assert.match(repository??'',/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);assert.match(runId??'',/^[1-9][0-9]*$/);
 const api=async(path,binary=false)=>{const r=await fetch(`https://api.github.com/repos/${repository}/${path}`,{headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});assert.ok(r.ok,`GitHub read failed (${r.status})`);return binary?Buffer.from(await r.arrayBuffer()):r.json();};
 if(process.argv[2]==='prepare'){
  const [run,jobs,artifacts,main]=await Promise.all([api(`actions/runs/${runId}`),api(`actions/runs/${runId}/jobs?per_page=100&filter=latest`),api(`actions/runs/${runId}/artifacts?per_page=100`),api('git/ref/heads/main')]);
  assert.ok(jobs.total_count<=100&&artifacts.total_count<=100,'Unexpected pagination; review build manually');
  const artifact=validateRelease({run,jobs:jobs.jobs,artifacts:artifacts.artifacts,repository,mainSha:main.object.sha,tag,dispatchRef:process.env.GITHUB_REF});
  const data=await api(`actions/artifacts/${artifact.id}/zip`,true);assert.equal('sha256:'+createHash('sha256').update(data).digest('hex'),artifact.digest,'Downloaded archive digest mismatch');
  await mkdir('release-check',{recursive:true});await writeFile('release-check/installer.zip',data);await writeFile('release-check/source.json',JSON.stringify({run,artifact,tag}));
  console.log(`Verified completed desktop run ${run.id} at ${run.head_sha}; archive digest matched.`);
 }else if(process.argv[2]==='recheck'){
  const {run,artifact}=JSON.parse(await readFile('release-check/source.json','utf8'));
  const [current,main]=await Promise.all([api(`actions/runs/${run.id}`),api('git/ref/heads/main')]);
  assert.equal(current.run_attempt,run.run_attempt,'Build was rerun after verification');assert.equal(current.status,'completed');assert.equal(current.conclusion,'success');assert.equal(main.object.sha,run.head_sha,'Main changed after verification');
  const currentArtifact=await api(`actions/artifacts/${artifact.id}`);assert.equal(currentArtifact.digest,artifact.digest);assert.equal(currentArtifact.expired,false);
  console.log('Source and artifact still match the reviewed build.');
 }else if(process.argv[2]==='verify'){
  const {run}=JSON.parse(await readFile('release-check/source.json','utf8'));
  const files=await readdir('installer',{withFileTypes:true});assert.equal(files.length,1,'Expected only the installer in the archive');assert.ok(files[0].isFile(),'Installer is not a file');assert.match(files[0].name,/^[A-Za-z0-9._-]+\.exe$/,'Unexpected installer filename');
  const filename=files[0].name,data=await readFile('installer/'+filename);assert.ok(data.length>1024*1024,'Installer is unexpectedly small');assert.equal(data.subarray(0,2).toString(),'MZ','Not a Windows executable');
  const sha=createHash('sha256').update(data).digest('hex');await writeFile('installer/SHA256SUMS.txt',`${sha}  ${filename}\n`);await writeFile('release-check/NOTES.md',releaseNotes({run,installerSha:sha,filename}));
  console.log(`Installer SHA-256 ${sha}`);
 }else throw Error('Choose prepare or verify');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
