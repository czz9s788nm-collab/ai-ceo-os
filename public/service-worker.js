self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='SCHEDULE_REMINDER')return;
  const {title,body,tag}=event.data;
  event.waitUntil(self.registration.showNotification(title,{body,tag,icon:'/assets/ai-ceo-os-logo.svg',badge:'/assets/ai-ceo-os-logo.svg',renotify:false,data:{url:'/#view=schedule'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    const existing=clients[0];
    if(existing){existing.focus();existing.navigate('/#view=schedule');return}
    return self.clients.openWindow('/#view=schedule');
  }));
});
