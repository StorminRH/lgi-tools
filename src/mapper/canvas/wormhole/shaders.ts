// Original procedural Atlas visual; no CCP image assets are embedded.
export const WORMHOLE_VERTEX = `attribute vec2 p;varying vec2 uv;void main(){uv=p;gl_Position=vec4(p,0.,1.);}`;

export const WORMHOLE_FRAGMENT = `precision highp float;
varying vec2 uv;
uniform float clock;uniform float rippleAge;uniform float seed;
uniform vec3 coreColor;uniform vec3 accentColor;uniform vec3 haloColor;uniform vec3 darkColor;uniform vec3 highlightColor;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float s=0.,amp=.5;for(int i=0;i<5;i++){s+=amp*noise(p);p=p*2.03+vec3(4.1,1.7,9.2);amp*=.5;}return s;}
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
vec3 n=vec3(rot(tm*.5)*sphere,z+.065*wave)+vec3(seed*2.3,seed*.7,seed*1.4);
float f=fbm(n*3.3+vec3(tm*.22,0.,tm));
float g=fbm(n*7.+vec3(f*2.,tm*.3,0.));
vec3 ice=mix(coreColor,accentColor,smoothstep(.38,.69,f));
vec3 white=highlightColor,dark=darkColor;
float mask=1.-smoothstep(.975,1.015,sr);
float cloud=smoothstep(.28,.73,f)*(.4+.6*g);
float split=smoothstep(.12,.27,abs(sphere.y+.17*sin(sphere.x*4.+f*3.)));
vec3 body=mix(dark,ice*.8,cloud*split)+white*pow(g,5.)*2.6*split;
float rim=pow(1.-z,4.)*(.45+.55*pow(sin(angle*3.+2.),2.));
body+=ice*rim*.65;
// Soft crest lighting and a shallow trough make the refraction readable.
body*=1.-.20*max(-wave,0.);
body+=ice*.19*max(wave,0.);
// Original lensed-sphere silhouette: a narrow glow, not the expanded smoky halo.
float haze=exp(-pow((sr-1.01)*17.,2.))*.14;
float alpha=clamp(mask+haze*(1.-mask),0.,1.);
vec3 color=body*mask+haloColor*haze;
float fade=1.-smoothstep(1.24,1.35,raw);
gl_FragColor=vec4(min(color,vec3(alpha))*fade,alpha*fade);
}`;
