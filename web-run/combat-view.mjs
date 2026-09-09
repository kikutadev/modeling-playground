import * as T from 'three';
export function createCombatView(scene,combat){
  const metal=new T.MeshStandardMaterial({color:0x233646,metalness:.55,roughness:.4});
  const light=new T.MeshBasicMaterial({color:0xff9c71});
  const drones=combat.drones.map(()=>{
    const root=new T.Group();root.scale.setScalar(2.35);scene.add(root);
    const hull=new T.Mesh(new T.OctahedronGeometry(1.15,0),metal);hull.scale.set(1.55,.62,1.02);hull.castShadow=true;root.add(hull);
    const eye=new T.Mesh(new T.SphereGeometry(.34,12,8),light.clone());eye.position.set(0,0,1.08);root.add(eye);
    const rotors=[];
    for(const x of [-1.7,1.7])for(const z of [-1.0,1.0]){
      const arm=new T.Mesh(new T.BoxGeometry(1.8,.14,.14),metal);arm.position.set(x*.54,0,z);root.add(arm);
      const disc=new T.Mesh(new T.TorusGeometry(.78,.09,6,18),metal);disc.rotation.x=Math.PI/2;disc.position.set(x,0,z);root.add(disc);
      const blade=new T.Mesh(new T.BoxGeometry(1.5,.05,.15),light);blade.position.copy(disc.position);root.add(blade);rotors.push(blade);
    }
    const cage=new T.LineSegments(new T.EdgesGeometry(new T.IcosahedronGeometry(1.9,1)),new T.LineBasicMaterial({color:0xcafff4,transparent:true,opacity:.85}));root.add(cage);
    const laser=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineBasicMaterial({color:0xff8868,transparent:true,opacity:.7}));laser.frustumCulled=false;scene.add(laser);
    const health=new T.Group();root.add(health);health.position.y=2.0;
    for(let i=0;i<3;i++){const pip=new T.Mesh(new T.BoxGeometry(.42,.13,.13),light);pip.position.x=(i-1)*.56;health.add(pip);}
    return {root,eye,rotors,cage,laser,health};
  });
  const ball=new T.SphereGeometry(1,8,6);
  const webMat=new T.MeshBasicMaterial({color:0xd6fff3}),boltMat=new T.MeshBasicMaterial({color:0xff7f4f});
  const projectiles=Array.from({length:32},()=>{const m=new T.Mesh(ball,webMat);scene.add(m);return m;});
  const flashes=[];
  return {
    event(event){if(!['hit','destroy','hurt'].includes(event.type))return;
      const m=new T.Mesh(new T.IcosahedronGeometry(1,0),new T.MeshBasicMaterial({color:event.type==='hurt'?0xff7256:0xcffff0,wireframe:true,transparent:true}));m.position.copy(event.position);scene.add(m);flashes.push({mesh:m,age:0,duration:event.type==='destroy'?.6:.25});
    },
    update(dt,body){
      drones.forEach((v,i)=>{
        const d=combat.drones[i];v.root.visible=d.hp>0;v.root.position.copy(d.position);v.root.rotation.y=Math.atan2(body.position.x-d.position.x,body.position.z-d.position.z);
        v.root.rotation.z=Math.sin(combat.time*3+i)*.06;
        v.rotors.forEach((r,k)=>r.rotation.y+=dt*55*(k%2?1:-1));v.cage.visible=d.stunUntil>combat.time;
        v.eye.material.color.setHex(d.charge>.8?0xffffff:d.charge>0?0xff572d:0xffbc85);
        v.health.children.forEach((pip,k)=>pip.visible=k<d.hp);
        v.laser.visible=d.hp>0&&!!d.chargeAim;
        if(d.chargeAim){const a=v.laser.geometry.attributes.position;a.setXYZ(0,...d.position.toArray());a.setXYZ(1,...d.chargeAim.toArray());a.needsUpdate=true;v.laser.material.opacity=.2+d.charge*.5;}
      });
      projectiles.forEach((mesh,i)=>{const p=combat.projectiles[i];mesh.visible=!!p;if(!p)return;mesh.position.copy(p.position);mesh.material=p.kind==='web'?webMat:boltMat;mesh.scale.setScalar(p.kind==='web'?.24:.38);});
      for(let i=flashes.length-1;i>=0;i--){const f=flashes[i];f.age+=dt;f.mesh.scale.setScalar(1+f.age*13);f.mesh.rotation.y+=dt*5;f.mesh.material.opacity=Math.max(0,1-f.age/f.duration);if(f.age>f.duration){scene.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();flashes.splice(i,1);}}
    },
    reset(){for(const f of flashes){scene.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();}flashes.length=0;}
  };
}
