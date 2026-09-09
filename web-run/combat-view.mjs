import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import sentinelUrl from './assets/sky-sentinel.glb?url';

function cloneMaterials(root){
  root.traverse(object=>{
    if(!object.isMesh)return;
    if(Array.isArray(object.material))object.material=object.material.map(material=>material.clone());
    else if(object.material)object.material=object.material.clone();
    object.castShadow=true;object.receiveShadow=true;
  });
}

function findMesh(root,name){let found=null;root.traverse(object=>{if(!found&&object.name===name)found=object;});return found;}

export function createCombatView(scene,combat){
  const light=new T.MeshBasicMaterial({color:0xff9c71});
  const sentinels=combat.drones.map(()=>{
    const root=new T.Group();scene.add(root);
    const modelHost=new T.Group();root.add(modelHost);
    // Tiny loading proxy only; it disappears as soon as the Blender asset is ready.
    const proxy=new T.Mesh(new T.IcosahedronGeometry(1.2,0),new T.MeshBasicMaterial({color:0x263f55,wireframe:true,transparent:true,opacity:.35}));
    modelHost.add(proxy);
    const laser=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineBasicMaterial({color:0xff8868,transparent:true,opacity:.72}));laser.frustumCulled=false;scene.add(laser);
    return {root,modelHost,proxy,laser,model:null,core:null,head:null,leftArm:null,rightArm:null,leftThruster:null,rightThruster:null};
  });

  new GLTFLoader().loadAsync(sentinelUrl).then(gltf=>{
    sentinels.forEach((view,index)=>{
      const model=gltf.scene.clone(true);cloneMaterials(model);
      view.modelHost.clear();view.modelHost.add(model);view.model=model;
      view.core=findMesh(model,'ReactorCore');
      view.head=model.getObjectByName('Head');
      view.leftArm=model.getObjectByName('LeftArm');view.rightArm=model.getObjectByName('RightArm');
      view.leftThruster=model.getObjectByName('LeftMainThruster');view.rightThruster=model.getObjectByName('RightMainThruster');
      model.userData.sentinelIndex=index;
    });
  }).catch(error=>console.error('Sky Sentinel GLB load failed',error));

  const ball=new T.SphereGeometry(1,8,6);
  const webMat=new T.MeshBasicMaterial({color:0xd6fff3}),boltMat=new T.MeshBasicMaterial({color:0xff7f4f});
  const projectiles=Array.from({length:32},()=>{const m=new T.Mesh(ball,webMat);scene.add(m);return m;});
  const flashes=[];

  return {
    event(event){if(!['hit','destroy','hurt'].includes(event.type))return;
      const m=new T.Mesh(new T.IcosahedronGeometry(1,0),new T.MeshBasicMaterial({color:event.type==='hurt'?0xff7256:0xcffff0,wireframe:true,transparent:true}));m.position.copy(event.position);scene.add(m);flashes.push({mesh:m,age:0,duration:event.type==='destroy'?.75:.28});
    },
    update(dt,body){
      sentinels.forEach((v,i)=>{
        const d=combat.drones[i];v.root.visible=d.hp>0;v.root.position.copy(d.position);
        // Blender asset faces -Z after glTF conversion; rotate the whole titan toward the hero.
        v.root.rotation.y=Math.atan2(body.position.x-d.position.x,body.position.z-d.position.z);
        const bank=T.MathUtils.clamp(-(d.motionVelocity?.x??0)*.015,-.16,.16);
        v.root.rotation.z=bank+Math.sin(combat.time*1.4+i)*.012;
        v.root.rotation.x=T.MathUtils.clamp((d.motionVelocity?.z??0)*.006,-.08,.08);
        v.root.position.y+=Math.sin(combat.time*.55+i)*.25;
        if(v.head)v.head.rotation.y=Math.sin(combat.time*.45+i)*.08;
        if(v.leftArm&&v.rightArm){
          const recoil=Math.max(0,d.charge-.82)*.10;
          v.leftArm.rotation.x=-recoil;v.rightArm.rotation.x=-recoil;
        }
        for(const thruster of [v.leftThruster,v.rightThruster])if(thruster)thruster.rotation.z+=dt*.42;
        if(v.core?.material){
          const hot=d.charge>.8||d.stunUntil>combat.time;
          if(v.core.material.emissive)v.core.material.emissive.setHex(hot?0xffffff:0xffb53d);
          v.core.material.emissiveIntensity=hot?7:3.5;
        }
        v.laser.visible=d.hp>0&&!!d.chargeAim;
        if(d.chargeAim){const a=v.laser.geometry.attributes.position;a.setXYZ(0,...d.position.toArray());a.setXYZ(1,...d.chargeAim.toArray());a.needsUpdate=true;v.laser.material.opacity=.18+d.charge*.52;}
      });
      projectiles.forEach((mesh,i)=>{const p=combat.projectiles[i];mesh.visible=!!p;if(!p)return;mesh.position.copy(p.position);mesh.material=p.kind==='web'?webMat:boltMat;mesh.scale.setScalar(p.kind==='web'?.24:.38);});
      for(let i=flashes.length-1;i>=0;i--){const f=flashes[i];f.age+=dt;f.mesh.scale.setScalar(2+f.age*34);f.mesh.rotation.y+=dt*5;f.mesh.material.opacity=Math.max(0,1-f.age/f.duration);if(f.age>f.duration){scene.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();flashes.splice(i,1);}}
    },
    reset(){for(const f of flashes){scene.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();}flashes.length=0;}
  };
}
