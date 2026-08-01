"use client";
export function LogoutButton(){return <button className="op-logout" onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});window.location.replace('/login')}}>تسجيل الخروج</button>}
