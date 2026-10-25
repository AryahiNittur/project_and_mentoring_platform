// Decorative only: the product remains usable without WebGL or Three.js.
try {
 const THREE = await import('./vendor/three.module.js');
 const canvas=document.getElementById('network'),host=document.getElementById('universe');
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,100);camera.position.set(0,.1,7);
 const group=new THREE.Group();scene.add(group);
 scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.PointLight(0xc0a9ff,24);light.position.set(3,3,4);scene.add(light);const light2=new THREE.PointLight(0xd5f58b,10);light2.position.set(-3,-2,2);scene.add(light2);
 const core=new THREE.Mesh(new THREE.TorusKnotGeometry(.73,.19,128,16,2,3),new THREE.MeshStandardMaterial({color:0xbba6ff,metalness:.42,roughness:.27}));group.add(core);
 const orbitMaterial=new THREE.MeshBasicMaterial({color:0xaba0d8,transparent:true,opacity:.26});
 [0,1,2].forEach((v)=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(1.85,.006,6,160),orbitMaterial);ring.rotation.set(v*.8+.5,v*.7,.4);group.add(ring)});
 const nodes=[];for(let i=0;i<16;i++){const angle=i/16*Math.PI*2;const p=new THREE.Vector3(Math.cos(angle)*1.9,Math.sin(angle)*1.4,Math.sin(angle*2)*.8);const node=new THREE.Mesh(new THREE.SphereGeometry(i%4===0?.085:.04,12,12),new THREE.MeshStandardMaterial({color:i%3===0?0xd2f58c:0xc0a6ff,emissive:i%3===0?0x49621e:0x392452,emissiveIntensity:.6,roughness:.35}));node.position.copy(p);nodes.push(node);group.add(node)}
 const lines=[];for(let i=0;i<nodes.length;i++){lines.push(...nodes[i].position.toArray(),...nodes[(i+3)%nodes.length].position.toArray())}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));group.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xb9a2ed,transparent:true,opacity:.13})));
 const starPos=[];let seed=82;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};for(let i=0;i<100;i++)starPos.push((rand()-.5)*9,(rand()-.5)*6,(rand()-.5)*4-1);const starsGeo=new THREE.BufferGeometry();starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3));scene.add(new THREE.Points(starsGeo,new THREE.PointsMaterial({color:0xc2bad9,size:.015,transparent:true,opacity:.6})));
 let active=!matchMedia('(prefers-reduced-motion: reduce)').matches,visible=true,frame=0,time=0,target={x:0,y:0};
 function resize(){const r=host.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);renderer.setSize(Math.round(r.width*ratio),Math.round(r.height*ratio),false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();draw()}
 function draw(){renderer.render(scene,camera)}
 function animate(){frame=0;if(!active||!visible||document.hidden)return;time+=.006;core.rotation.x=time*.35;core.rotation.y=time*.65;group.rotation.y+=(target.x*.24+Math.sin(time*.3)*.12-group.rotation.y)*.035;group.rotation.x+=(target.y*.14-group.rotation.x)*.035;core.position.y=Math.sin(time)*.045;draw();frame=requestAnimationFrame(animate)}
 function resume(){if(!frame&&active&&visible&&!document.hidden)frame=requestAnimationFrame(animate)}
 host.addEventListener('pointermove',e=>{let r=host.getBoundingClientRect();target.x=(e.clientX-r.left)/r.width-.5;target.y=(e.clientY-r.top)/r.height-.5});host.addEventListener('pointerleave',()=>target={x:0,y:0});
 window.addEventListener('bridge-motion',e=>{active=e.detail;if(!active){cancelAnimationFrame(frame);frame=0;draw()}else resume()});
 new ResizeObserver(resize).observe(host);new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;resume()}).observe(host);document.addEventListener('visibilitychange',resume);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();active=false;cancelAnimationFrame(frame);host.classList.remove('webgl');canvas.style.display='none'});
 resize();host.classList.add('webgl');resume();
} catch(error){console.info('3D unavailable. Showing CSS constellation fallback.');}
