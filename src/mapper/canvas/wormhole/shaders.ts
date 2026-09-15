// Original procedural Atlas visual; no CCP image assets are embedded.
export const WORMHOLE_VERTEX = `attribute vec2 p;varying vec2 uv;void main(){uv=p;gl_Position=vec4(p,0.,1.);}`;

export const WORMHOLE_FRAGMENT = `precision highp float;
varying vec2 uv;
uniform float clock;uniform float rippleAge;uniform float seed;
uniform vec3 coreColor;uniform vec3 accentColor;uniform vec3 haloColor;uniform vec3 darkColor;uniform vec3 highlightColor;
mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
void main(){
vec2 p=uv*1.36;float raw=length(p);float tm=clock*.024;
vec2 q=vec2(dot(p,vec2(.8,.6)),dot(p,vec2(-.6,.8)));
// The same interaction clock starts the elastic wobble and center ripple.
float wobbleEnvelope=exp(-2.15*rippleAge)*(1.-smoothstep(1.8,2.8,rippleAge));
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
ice=mix(vec3(luminance),ice,.55);
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
vec3 color=body*mask+haloColor*haze;
float fade=1.-smoothstep(1.24,1.35,raw);
gl_FragColor=vec4(min(color,vec3(alpha))*fade,alpha*fade);
}`;
