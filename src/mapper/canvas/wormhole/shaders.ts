import { WORMHOLE_IMPULSE_SETTLE_S } from './motion';
import { EFFECT_MODE, PLANET_MODE } from './palette';

/** Canvas half-extent in sphere radii: the aura needs a sphere-width of room on each side. */
export const BODY_EXTENT = 2;

const isMode = (mode: number) => `abs(mode-${mode}.)<.5`;

// Original procedural Atlas visual; no CCP image assets are embedded.
export const WORMHOLE_VERTEX = `attribute vec2 p;varying vec2 uv;void main(){uv=p;gl_Position=vec4(p,0.,1.);}`;

export const WORMHOLE_FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 uv;
uniform float clock;uniform float rippleAge;uniform float seed;uniform float mode;uniform float focus;
uniform vec3 coreColor;uniform vec3 accentColor;uniform vec3 haloColor;uniform vec3 darkColor;uniform vec3 highlightColor;uniform vec3 tintColor;
mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
vec4 over(vec4 top,vec4 below){return top+below*(1.-top.a);}
vec4 light(vec4 b,vec3 c,float i){i=max(i,0.);b.rgb+=c*i;b.a=clamp(b.a+i,0.,1.);return b;}
float band(float x,float c,float w){float d=(x-c)/w;return exp(-d*d);}
vec4 glass(vec2 p,float tintAmount){
float tm=clock*.024;
vec2 q=vec2(dot(p,vec2(.8,.6)),dot(p,vec2(-.6,.8)));
// The same interaction clock starts the elastic wobble and center ripple.
float wobbleEnvelope=exp(-2.15*rippleAge)*(1.-smoothstep(1.8,${WORMHOLE_IMPULSE_SETTLE_S},rippleAge));
float stretch=.105*wobbleEnvelope*sin(rippleAge*10.5);
q.x/=1.+stretch;q.y*=1.+stretch;
float angle=atan(q.y,q.x);
float jelly=.022*wobbleEnvelope*sin(rippleAge*14.5)*sin(angle*3.);
q/=1.+jelly;
vec2 baseSphere=q;float sr=length(baseSphere);
// Broader crests with more space between them travel from center to rim.
float waveDistance=sr-rippleAge*.52;
float envelope=smoothstep(0.,.10,rippleAge)*(1.-smoothstep(1.65,2.65,rippleAge));
float packet=exp(-waveDistance*waveDistance/ .045)*envelope;
float edgeFade=1.-smoothstep(.85,1.,sr);
float wave=sin(waveDistance*22.)*packet*edgeFade;
vec2 radial=baseSphere/max(sr,.001);
vec2 sphere=baseSphere+radial*.085*wave*smoothstep(0.,.10,sr);
float z=sqrt(max(0.,1.-sr*sr));
// Smooth glass shading: class color lives mainly at the edge, with no nebula grain.
vec2 lightPoint=rot(tm*.4+seed*.3)*vec2(-.32,.38);
float sheen=exp(-dot(sphere-lightPoint,sphere-lightPoint)*2.8);
vec3 ice=mix(coreColor,accentColor,.4);
float luminance=dot(ice,vec3(.2126,.7152,.0722));
ice=mix(mix(vec3(luminance),ice,.55),tintColor,tintAmount);
float mask=1.-smoothstep(.975,1.015,sr);
vec3 body=mix(vec3(.025,.035,.050),darkColor,.16);
body+=highlightColor*(.018+.075*sheen)*z;
float rim=pow(1.-z,2.8)*(.65+.35*sheen);
body+=ice*rim*.42;
// Soft crest lighting and a shallow trough make the refraction readable.
body*=1.-.20*max(-wave,0.);
body+=mix(highlightColor,ice,.35)*.10*max(wave,0.);
// Original lensed-sphere silhouette: a narrow glow, not the expanded smoky halo.
float haze=exp(-pow((sr-1.01)*17.,2.))*.055;
float alpha=clamp(mask+haze*(1.-mask),0.,1.);
vec3 color=body*mask+mix(haloColor,tintColor,tintAmount)*haze;
return vec4(min(color,vec3(alpha)),alpha);
}
// Each effect keeps the same soft aura and differs only in its rhythm.
vec4 aura(vec2 p,float sr,vec2 d,float t){
float outer=max(sr-1.,0.);
float n=fbm(d*3.+vec2(t*.2,-t*.15)+outer*2.);
float falloff=${isMode(EFFECT_MODE['red-giant'])}?2.8:5.;
float base=exp(-outer*falloff)*smoothstep(.97,1.04,sr);
float m=1.;
if(${isMode(EFFECT_MODE.pulsar)}) m=.35+1.1*pow(.5+.5*sin(t*6.5),6.);
else if(${isMode(EFFECT_MODE['black-hole'])}) m=.25+.95*smoothstep(-.3,1.,cos(atan(p.y,p.x)-t*.9));
else if(${isMode(EFFECT_MODE.magnetar)}) m=.3+noise(vec2(t*11.,n*5.));
else if(${isMode(EFFECT_MODE['cataclysmic-variable'])}) m=.3+1.2*exp(-mod(t+seed*3.,4.2)*2.);
else if(${isMode(EFFECT_MODE['wolf-rayet'])}) m=.2+1.6*pow(fbm(rot(t*.05)*d*6.),2.);
float au=base*(.45+.7*n)*m*.9;
return vec4(tintColor*au,min(au,1.));
}
vec4 planet(vec2 p,float sr,vec2 d,float t){
float R=.92;float ss=sr/R;float m=1.-smoothstep(R-.012,R+.012,sr);
float z=sqrt(max(0.,1.-ss*ss));vec3 normal=vec3(p/R,z);
vec3 sun=normalize(vec3(-.55,.5,.67));
float diffuse=max(dot(normal,sun),0.);
float bands=fbm(vec2(p.y*5.,p.x*1.2+t*.04+seed*3.));
vec3 albedo=mix(tintColor*.35,tintColor*.9,bands)+vec3(.03);
vec3 c=albedo*(.06+.94*diffuse);
float lit=dot(d,normalize(sun.xy));
c+=tintColor*pow(1.-z,2.5)*smoothstep(-.3,.6,lit)*m*.6*(1.+.4*focus);
return light(vec4(c*m,m),tintColor,band(sr,R+.02,.06)*smoothstep(-.4,.7,lit)*.5);
}
void main(){
vec2 p=uv*${BODY_EXTENT}.;float raw=length(p);vec2 d=p/max(raw,.001);
vec4 color;
if(${isMode(PLANET_MODE)}) color=planet(p,raw,d,clock);
else if(mode<.5) color=glass(p,0.);
else color=over(aura(p,raw,d,clock),glass(p,.25));
color*=1.-smoothstep(1.82,2.,raw);
gl_FragColor=vec4(min(color.rgb,vec3(color.a)),color.a);
}`;
