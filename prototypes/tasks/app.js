(() => {
  'use strict';
  const TODAY = '2026-10-31';
  const icons = {
    plus:'<path d="M12 5v14M5 12h14"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
    arrow:'<path d="m9 5 7 7-7 7"/>', left:'<path d="m15 5-7 7 7 7"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h1m6 0h1m-8 3h1"/>',
    today:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m5 5 2 2 4-4"/>',
    lists:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M9 8h7M9 12h7M9 16h7M7 8h.01M7 12h.01M7 16h.01"/>',
    settings:'<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/><circle cx="12" cy="12" r="3"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    repeat:'<path d="m16 3 4 4-4 4M4 11V9a2 2 0 0 1 2-2h14M8 21l-4-4 4-4m12 0v2a2 2 0 0 1-2 2H4"/>',
    check:'<path d="m5 12 4 4L19 6"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon:'<path d="M20.6 13A9 9 0 0 1 11 3.4 9 9 0 1 0 20.6 13Z"/>',
    flag:'<path d="M5 21V3m0 1c5-4 9 4 14 0v9c-5 4-9-4-14 0"/>',
    leaf:'<path d="M20 3C9 1 2 8 5 15s17 7 15-12ZM4 21 15 10"/>',
    briefcase:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12c6 4 12 4 18 0m-9 1v3"/>',
    heart:'<path d="M20 4a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 2 11 8 16 6-5 13-11 8-16Z"/>',
    folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.lists}</svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fromDate = key => { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d,12); };
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const prettyDate = (key, options) => fromDate(key).toLocaleDateString('en-GB',options);
  const shortDate = key => prettyDate(key,{day:'numeric',month:'short'});
  const timeText = time => { if (!time) return ''; const [h,m]=time.split(':'); return `${Number(h)%12||12}:${m} ${Number(h)<12?'AM':'PM'}`; };
  const initialLists = [{id:1,name:'Personal',icon:'heart'},{id:2,name:'Work',icon:'briefcase'},{id:3,name:'Routines',icon:'repeat'}];
  const initialTasks = [
    {id:1,title:'Book the dentist appointment',date:'2026-10-30',time:'10:00',list:1,priority:1,repeat:'none',notes:'Ask for a morning appointment.',done:false},
    {id:2,title:'Finish the Tasks app design',date:TODAY,time:'09:30',list:2,priority:2,repeat:'none',notes:'Keep the overview simple. Review the calendar and quick-add flow.',done:false},
    {id:3,title:'Pick up a few groceries',date:TODAY,time:'12:00',list:1,priority:0,repeat:'none',notes:'Bread, eggs, vegetables, and coffee.',done:false},
    {id:4,title:'Go for a walk, get some fresh air',date:TODAY,time:'17:30',list:3,priority:0,repeat:'daily',notes:'Just 20 minutes. No need to overthink it.',done:false},
    {id:5,title:'Read a little before bed',date:TODAY,time:'21:00',list:3,priority:0,repeat:'daily',notes:'A chapter is enough.',done:false},
    {id:6,title:'Review next month’s budget',date:'2026-11-01',time:'10:00',list:1,priority:1,repeat:'monthly',notes:'Look at recurring expenses and the savings target.',done:false},
    {id:7,title:'Plan the week ahead',date:'2026-11-02',time:'09:00',list:2,priority:0,repeat:'weekly',notes:'Pick the three things that matter most.',done:false},
    {id:8,title:'Back up my notes',date:'2026-11-04',time:'18:00',list:1,priority:0,repeat:'weekly',notes:'Save a copy to the shared backup folder.',done:false},
    {id:9,title:'Tidy up the workspace',date:TODAY,time:'08:00',list:2,priority:0,repeat:'none',notes:'',done:true},
    {id:10,title:'Refill the water bottle',date:TODAY,time:'08:30',list:3,priority:0,repeat:'none',notes:'',done:true},
    {id:11,title:'Ideas for a weekend away',date:'',time:'',list:1,priority:0,repeat:'none',notes:'A small trip somewhere quiet.',done:false}
  ];
  let tasks=structuredClone(initialTasks), lists=structuredClone(initialLists), nextId=100, undo=null, toastTimer;
  let theme='light';
  const phones=[...document.querySelectorAll('.phone')];
  const state=new Map(phones.map(phone=>[phone.id,{view:phone.dataset.default,filter:'today',list:0,search:'',searchOpen:false,date:TODAY,month:'2026-10-01',week:false,showDone:false}]));
  const taskDialog=document.getElementById('task-dialog'), form=document.getElementById('task-form');
  const listDialog=document.getElementById('list-dialog');
  let editingPhone=phones[0];
  const byList=id=>lists.find(list=>list.id===Number(id));
  function header(title,kicker,action='search') { return `<header class="app-header"><div><p class="kicker">${escape(kicker)}</p><h2>${escape(title)}</h2></div><button class="icon-button" data-action="${action}" aria-label="${action==='search'?'Search tasks':'Open reminder settings'}">${icon(action==='search'?'search':'bell')}</button></header>`; }
  function counts(){return {today:tasks.filter(t=>t.date===TODAY&&!t.done).length,upcoming:tasks.filter(t=>t.date>TODAY&&!t.done).length,overdue:tasks.filter(t=>t.date&&t.date<TODAY&&!t.done).length,completed:tasks.filter(t=>t.done).length};}
  function row(task,agenda=false){
    const list=byList(task.list), late=task.date&&task.date<TODAY&&!task.done;
    let when=late?`Yesterday${task.time?' · '+timeText(task.time):''}`:task.time?timeText(task.time):task.date&&task.date!==TODAY?shortDate(task.date):'No reminder';
    if(late&&task.date!=='2026-10-30')when=`${shortDate(task.date)}${task.time?' · '+timeText(task.time):''}`;
    return `<article class="task-row${late?' overdue':''}${task.done?' done':''}" data-task-id="${task.id}"><button class="task-check" data-action="complete" data-id="${task.id}" role="checkbox" aria-checked="${task.done}" aria-label="${task.done?'Reopen':'Complete'} ${escape(task.title)}"><span class="check-ring">${task.done?icon('check'):''}</span></button><button class="task-main" data-action="edit" data-id="${task.id}" aria-label="Edit ${escape(task.title)}">${agenda?`<span class="task-meta">${escape(list?.name||'Tasks')}${task.priority===2?' · High priority':''}</span>`:''}<span class="task-title">${escape(task.title)}</span><span class="task-meta"><span class="meta-time">${icon(task.time?'bell':'calendar')}${escape(when)}</span>${!agenda?`<span class="meta-dot">·</span><span>${escape(list?.name||'Tasks')}</span>`:''}${task.repeat!=='none'?`${icon('repeat')}<span>${escape(task.repeat[0].toUpperCase()+task.repeat.slice(1))}</span>`:''}</span></button><span class="row-tail" aria-label="${task.priority===2?'High priority':''}">${task.priority===2?'<span class="priority-dot"></span>':icon('arrow')}</span></article>`;
  }
  function empty(phone,message='A little breathing room.',detail='Nothing here for now. Add something when you’re ready.'){return `<div class="empty-state">${icon('leaf')}<h4>${escape(message)}</h4><p>${escape(detail)}</p><button class="secondary-button" data-action="add">Add a task</button></div>`;}
  function filtered(s){return tasks.filter(t=>{
    const match=s.filter==='today'?!t.done&&t.date&&t.date<=TODAY:s.filter==='upcoming'?!t.done&&t.date>TODAY:s.filter==='overdue'?!t.done&&t.date&&t.date<TODAY:s.filter==='completed'?t.done:!t.done;
    const search=(t.title+' '+t.notes+' '+(byList(t.list)?.name||'')).toLowerCase().includes(s.search.toLowerCase());
    return match&&(!s.list||t.list===s.list)&&search;
  }).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'99').localeCompare(b.time||'99')||b.priority-a.priority);}
  function overview(phone,s){
    const n=counts(), visible=filtered(s), late=visible.filter(t=>t.date&&t.date<TODAY&&!t.done), other=visible.filter(t=>!late.includes(t));
    const tiles=[['today','Today','today'],['upcoming','Upcoming','calendar'],['overdue','Overdue','clock'],['completed','Completed','check']];
    const title={today:'Today’s focus',upcoming:'Coming up',overdue:'A little overdue',completed:'Things you’ve done',all:'All open tasks'}[s.filter];
    const chips=[{id:0,name:'All lists'},...lists];
    return `${header('Make room for today.','Saturday, 31 October')}<div class="overview-grid">${tiles.map(([key,label,shape])=>`<button class="stat-tile" data-action="filter" data-filter="${key}" aria-pressed="${s.filter===key}"><span class="stat-top"><span class="stat-number">${n[key]}</span>${icon(shape)}</span><span class="stat-bottom">${label}${icon('arrow')}</span></button>`).join('')}</div><div class="section-head"><h3>Your lists</h3><button class="subtle-button" data-action="lists">View all ${icon('arrow').replace('<svg','<svg style="display:inline-block;vertical-align:middle;width:11px;height:11px"')}</button></div><div class="list-chips" aria-label="Filter by list">${chips.map(l=>`<button class="chip${s.list===l.id?' active':''}" data-action="list-filter" data-list="${l.id}" aria-pressed="${s.list===l.id}">${l.id?'<span class="dot"></span>':''}${escape(l.name)}</button>`).join('')}</div><div class="section-head"><h3>${title}<span class="text-count">${visible.length}</span></h3><button class="subtle-button" data-action="all-tasks">${s.filter==='all'?'Today':'All tasks'}</button></div>${s.searchOpen?`<label class="search-box">${icon('search')}<input data-search placeholder="Find a task…" value="${escape(s.search)}" aria-label="Search task titles, notes, and lists"></label>`:''}${visible.length?`${s.filter==='today'&&late.length?`<div class="overdue-heading">${icon('clock')}${late.length} overdue · still worth a little attention</div><div class="task-list">${late.map(t=>row(t)).join('')}</div>`:''}${s.filter==='today'&&late.length&&other.length?'<p class="task-group-label">On your plan today</p>':''}<div class="task-list">${(s.filter==='today'?other:visible).map(t=>row(t)).join('')}</div>`:empty(phone,s.search?'No matching tasks.':'A little breathing room.',s.search?'Try another name or clear your search.':'You’re all clear here. Take it one thing at a time.')}<p class="focus-note">Small steps are still steps.</p>`;
  }
  function calendar(phone,s){
    const month=fromDate(s.month), first=new Date(month.getFullYear(),month.getMonth(),1,12), offset=(first.getDay()+6)%7;
    let start=new Date(first); start.setDate(1-offset);
    if(s.week){start=fromDate(s.date);start.setDate(start.getDate()-(start.getDay()+6)%7);}
    const cells=[];
    for(let i=0;i<(s.week?7:Math.ceil((offset+new Date(month.getFullYear(),month.getMonth()+1,0).getDate())/7)*7);i++){
      const day=new Date(start);day.setDate(start.getDate()+i);const key=dateKey(day);const n=tasks.filter(t=>t.date===key&&!t.done).length;
      cells.push(`<button class="day${day.getMonth()!==month.getMonth()?' outside':''}${key===TODAY?' is-today':''}" data-action="date" data-date="${key}" aria-pressed="${key===s.date}" aria-label="${escape(prettyDate(key,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}, ${n} open ${n===1?'task':'tasks'}"><span>${day.getDate()}</span>${n?'<span class="date-dot" aria-hidden="true"></span>':''}</button>`);
    }
    const all=tasks.filter(t=>t.date===s.date).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99'));
    const visible=all.filter(t=>s.showDone||!t.done), open=all.filter(t=>!t.done).length;
    return `<div class="calendar-top">${header('A little planning.','Make space for what matters.','reminders')}</div><div class="month-header"><h3>${prettyDate(s.month,{month:'long'})}<small>${month.getFullYear()}</small></h3><div class="month-actions"><button class="icon-button" data-action="prev-month" aria-label="Previous ${s.week?'week':'month'}">${icon('left')}</button><button class="icon-button" data-action="next-month" aria-label="Next ${s.week?'week':'month'}">${icon('arrow')}</button></div></div><div class="calendar-toolbar"><div class="segmented" aria-label="Calendar display"><button data-action="month-view" class="${!s.week?'active':''}" aria-pressed="${!s.week}">Month</button><button data-action="week-view" class="${s.week?'active':''}" aria-pressed="${s.week}">Week</button></div><button class="subtle-button" data-action="jump-today">Back to today</button></div><div class="calendar-grid">${['M','T','W','T','F','S','S'].map((d,i)=>`<span class="weekday" aria-label="${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]}">${d}</span>`).join('')}${cells.join('')}</div><div class="agenda-heading"><div><h3>${s.date===TODAY?'Today’s tasks':prettyDate(s.date,{weekday:'long',day:'numeric',month:'short'})}</h3><p>${open} ${open===1?'thing':'things'} on your plan${s.date===TODAY?' · 31 October':''}</p></div><button class="small-add" data-action="add" aria-label="Add task for ${escape(shortDate(s.date))}">${icon('plus')}</button></div><div class="agenda-list">${visible.length?visible.map(t=>row(t,true)).join(''):empty(phone,'This day is yours.','A clear calendar. Add something you want to make time for.')}</div>${all.some(t=>t.done)?`<button class="subtle-button" data-action="toggle-done">${s.showDone?'Hide':'Show'} completed (${all.filter(t=>t.done).length})</button>`:''}`;
  }
  function listView(){return `${header('A place for everything.','YOUR LISTS','reminders')}<p class="view-subtitle">Keep different parts of life a little more organized.</p>${lists.map(l=>`<button class="list-card" data-action="open-list" data-list="${l.id}"><span class="list-emblem">${icon(l.icon)}</span><span><strong>${escape(l.name)}</strong><small>${tasks.filter(t=>t.list===l.id&&!t.done).length} open · ${tasks.filter(t=>t.list===l.id&&t.done).length} completed</small></span>${icon('arrow')}</button>`).join('')}<button class="secondary-button" style="width:100%;margin-top:8px" data-action="new-list">＋ New list</button>`;}
  function settings(){return `${header('Make it yours.','SETTINGS','reminders')}<section class="settings-section"><h3>Appearance</h3><div class="setting-row">${icon(theme==='light'?'sun':'moon')}<span class="setting-text"><strong>Theme</strong></span><div class="theme-choices"><button data-action="light" class="${theme==='light'?'active':''}">Light</button><button data-action="dark" class="${theme==='dark'?'active':''}">Dark</button></div></div></section><section class="settings-section"><h3>Reminders</h3><div class="setting-row">${icon('bell')}<span class="setting-text"><strong>Notifications</strong><p>Android permission is checked in the app.</p></span><span style="color:var(--green);font-size:10px">Enabled</span></div><div class="setting-row">${icon('clock')}<span class="setting-text"><strong>Precise reminders</strong><p>Delivered while your phone sleeps.</p></span><span style="color:var(--green);font-size:10px">Enabled</span></div><div class="setting-row">${icon('shield')}<span class="setting-text"><strong>Battery & background access</strong><p>Setup guidance stays one tap away.</p></span></div></section><section class="settings-section"><h3>Your data</h3><div class="setting-row">${icon('folder')}<span class="setting-text"><strong>Backup & restore</strong><p>Folder export, Hub import, and recovery remain in the real app.</p></span></div></section><p class="prototype-caption">Preview status only. This design uses sample tasks and cannot change your phone’s notification permissions or personal records.</p>`;}
  function render(phone){
    const s=state.get(phone.id), scroll=phone.querySelector('.app-body'), top=scroll.scrollTop;
    phone.dataset.view=s.view;
    scroll.innerHTML=s.view==='calendar'?calendar(phone,s):s.view==='lists'?listView():s.view==='settings'?settings():overview(phone,s);
    phone.querySelector('.app-nav').innerHTML=[['today','Today','today'],['calendar','Calendar','calendar'],['add','New task','plus'],['lists','Lists','lists'],['settings','Settings','settings']].map(([view,label,shape])=>view==='add'?`<button class="nav-add" data-action="add" aria-label="Add a task">${icon('plus')}</button>`:`<button class="nav-button${s.view===view?' active':''}" data-action="navigate" data-view="${view}" ${s.view===view?'aria-current="page"':''}>${icon(shape)}<span>${label}</span></button>`).join('');
    scroll.scrollTop=top;
  }
  function renderAll(){phones.forEach(render);}
  function toast(message,callback){
    clearTimeout(toastTimer);const element=document.getElementById('toast');element.hidden=false;element.querySelector('span').textContent=message;
    const button=element.querySelector('button');button.hidden=!callback;button.onclick=()=>{callback?.();element.hidden=true;};
    toastTimer=setTimeout(()=>{element.hidden=true;undo=null;},callback?9000:3500);
  }
  function nextRepeat(task){
    const date=fromDate(task.date), day=date.getDate(), anchor=task.anchorDay||day;
    if(task.repeat==='daily')date.setDate(day+1);
    if(task.repeat==='weekly')date.setDate(day+7);
    if(task.repeat==='monthly'){date.setDate(1);date.setMonth(date.getMonth()+1);date.setDate(Math.min(anchor,new Date(date.getFullYear(),date.getMonth()+1,0).getDate()));}
    if(task.repeat==='yearly'){const month=date.getMonth();date.setDate(1);date.setFullYear(date.getFullYear()+1);date.setMonth(month);date.setDate(Math.min(anchor,new Date(date.getFullYear(),month+1,0).getDate()));}
    return {...task,id:nextId++,date:dateKey(date),done:false,parentId:task.id,anchorDay:anchor};
  }
  function complete(id){
    const task=tasks.find(t=>t.id===Number(id));if(!task)return;
    const before=structuredClone(task), wasDone=task.done;let childId=null;
    if(wasDone&&tasks.some(t=>t.parentId===task.id)){toast('Remove or finish the next occurrence before reopening this task.');return;}
    task.done=!task.done;
    if(task.done&&task.repeat!=='none'&&task.date){const child=nextRepeat(task);childId=child.id;tasks.push(child);}
    renderAll();
    undo=()=>{Object.assign(task,before);if(childId)tasks=tasks.filter(t=>t.id!==childId);renderAll();};
    toast(wasDone?'Task reopened':childId?'Done. Next occurrence added.':'One less thing. Nicely done.',()=>undo?.());
  }
  function openEditor(phone,id){
    editingPhone=phone;const s=state.get(phone.id), task=tasks.find(t=>t.id===Number(id));form.reset();
    form.elements.list.innerHTML=lists.map(l=>`<option value="${l.id}">${escape(l.name)}</option>`).join('');
    form.elements.id.value=task?.id||'';form.elements.title.value=task?.title||'';form.elements.date.value=task?.date??(s.view==='calendar'?s.date:TODAY);form.elements.time.value=task?.time||'';form.elements.list.value=task?.list||s.list||lists[0].id;form.elements.repeat.value=task?.repeat||'none';form.elements.priority.value=task?.priority||0;form.elements.notes.value=task?.notes||'';
    document.getElementById('editor-title').textContent=task?'A little fine-tuning.':'Make it a task.';document.getElementById('save-task').textContent=task?'Save changes':'Add task';document.getElementById('delete-task').hidden=!task;document.getElementById('form-error').hidden=true;
    form.querySelector('.more-options').open=Boolean(task?.notes||task?.priority);updateDateControls();taskDialog.showModal();form.elements.title.focus();
  }
  function updateDateControls(){const missing=!form.elements.date.value;form.elements.time.disabled=missing;form.elements.repeat.disabled=missing;if(missing){form.elements.time.value='';form.elements.repeat.value='none';}}
  form.elements.date.addEventListener('input',updateDateControls);
  form.addEventListener('submit',event=>{
    event.preventDefault();const title=form.elements.title.value.trim();if(!title){const error=document.getElementById('form-error');error.textContent='Give your task a name first.';error.hidden=false;form.elements.title.focus();return;}
    const existing=tasks.find(t=>t.id===Number(form.elements.id.value));
    const values={title,date:form.elements.date.value,time:form.elements.date.value?form.elements.time.value:'',list:Number(form.elements.list.value),repeat:form.elements.date.value?form.elements.repeat.value:'none',priority:Number(form.elements.priority.value),notes:form.elements.notes.value.trim()};
    if(existing)Object.assign(existing,values,{anchorDay:values.date?fromDate(values.date).getDate():undefined});else tasks.push({id:nextId++,done:false,...values});
    taskDialog.close();renderAll();toast(existing?'Task updated.':'A little more organized. Task added.');
  });
  document.getElementById('delete-task').addEventListener('click',()=>{
    const id=Number(form.elements.id.value), snapshot=structuredClone(tasks), task=tasks.find(t=>t.id===id);if(!task)return;
    tasks=tasks.filter(t=>t.id!==id).map(t=>t.parentId===id?{...t,parentId:null}:t);taskDialog.close();renderAll();
    toast('Task deleted.',()=>{tasks=snapshot;renderAll();});
  });
  document.querySelectorAll('.close-dialog').forEach(button=>{button.innerHTML=button.classList.contains('icon-button')?icon('close'):button.innerHTML;button.addEventListener('click',()=>taskDialog.close());});
  document.querySelectorAll('.close-list').forEach(button=>{button.innerHTML=button.classList.contains('icon-button')?icon('close'):button.innerHTML;button.addEventListener('click',()=>listDialog.close());});
  [taskDialog,listDialog].forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
  document.getElementById('list-form').addEventListener('submit',event=>{event.preventDefault();const input=event.target.elements.name,name=input.value.trim();if(!name){input.focus();return;}lists.push({id:nextId++,name,icon:'folder'});listDialog.close();renderAll();toast('A new list, ready for your ideas.');});
  phones.forEach(phone=>{
    phone.addEventListener('click',event=>{
      const button=event.target.closest('button[data-action]');if(!button)return;const s=state.get(phone.id), action=button.dataset.action;
      if(action==='complete'){complete(button.dataset.id);return;}
      if(action==='edit'||action==='add'){openEditor(phone,action==='edit'?button.dataset.id:undefined);return;}
      if(action==='navigate'){s.view=button.dataset.view;phone.querySelector('.app-body').scrollTop=0;}
      if(action==='filter'){s.filter=button.dataset.filter;s.search='';}
      if(action==='list-filter')s.list=Number(button.dataset.list);
      if(action==='all-tasks'){s.filter=s.filter==='all'?'today':'all';s.list=0;}
      if(action==='search'){s.searchOpen=!s.searchOpen;s.search='';}
      if(action==='lists')s.view='lists';
      if(action==='open-list'){s.list=Number(button.dataset.list);s.view='today';s.filter='all';s.search='';}
      if(action==='new-list'){document.getElementById('list-form').reset();listDialog.showModal();return;}
      if(action==='reminders')s.view='settings';
      if(action==='date'){s.date=button.dataset.date;s.month=s.date.slice(0,7)+'-01';}
      if(action==='month-view')s.week=false;
      if(action==='week-view')s.week=true;
      if(action==='jump-today'){s.date=TODAY;s.month=TODAY.slice(0,7)+'-01';}
      if(action==='prev-month'||action==='next-month'){
        const dir=action==='next-month'?1:-1,date=fromDate(s.week?s.date:s.month);
        if(s.week){date.setDate(date.getDate()+7*dir);s.date=dateKey(date);}else date.setMonth(date.getMonth()+dir);
        s.month=dateKey(date).slice(0,7)+'-01';if(!s.week)s.date=s.month;
      }
      if(action==='toggle-done')s.showDone=!s.showDone;
      if(action==='light'||action==='dark'){setTheme(action);return;}
      render(phone);if(action==='search'&&s.searchOpen)phone.querySelector('[data-search]')?.focus();
    });
    phone.addEventListener('input',event=>{if(!event.target.matches('[data-search]'))return;const input=event.target,position=input.selectionStart,s=state.get(phone.id);s.search=input.value;render(phone);const replacement=phone.querySelector('[data-search]');replacement.focus();replacement.setSelectionRange(position,position);});
  });
  function setTheme(value){theme=value;document.documentElement.dataset.theme=value;const button=document.getElementById('theme-toggle');button.innerHTML=icon(value==='light'?'moon':'sun');button.setAttribute('aria-label',`Switch to ${value==='light'?'dark':'light'} theme`);renderAll();}
  document.getElementById('theme-toggle').addEventListener('click',()=>setTheme(theme==='light'?'dark':'light'));
  document.getElementById('reset').addEventListener('click',()=>{tasks=structuredClone(initialTasks);lists=structuredClone(initialLists);nextId=100;undo=null;clearTimeout(toastTimer);document.getElementById('toast').hidden=true;phones.forEach(phone=>state.set(phone.id,{view:phone.dataset.default,filter:'today',list:0,search:'',searchOpen:false,date:TODAY,month:'2026-10-01',week:false,showDone:false}));setTheme('light');phones.forEach(phone=>phone.querySelector('.app-body').scrollTop=0);});
  document.querySelector('.wordmark').addEventListener('click',event=>{event.preventDefault();document.getElementById('reset').click();});
  setTheme('light');
})();
