/* Synthetic XREF fixture. Build against LibreDWG 0.14; not application code. */
#include <dwg.h>
#include <dwg_api.h>
#include <stdlib.h>
#include <string.h>
int main(int argc,char **argv){
 if(argc!=3)return 2;
 Dwg_Data *dwg=dwg_new_Document(R_2000,0,0);dwg->header_vars.INSUNITS=4;
 Dwg_Object_BLOCK_HEADER *b=dwg_add_BLOCK_HEADER(dwg,"facade");
 dwg_add_BLOCK(b,"facade");dwg_add_ENDBLK(b);
 b->flag=4;b->blkisxref=1;b->xref_loaded=1;b->xref_pname=strdup("refs/facade.dwg");
 Dwg_Object_BLOCK_HEADER *model=dwg_model_space_object(dwg)->tio.object->tio.BLOCK_HEADER;
 dwg_point_3d pt={1000,2000,0};Dwg_Entity_INSERT *insert=dwg_add_INSERT(model,&pt,"facade",1,1,1,0);
 int err=0;
 Dwg_Object *ins=dwg_ent_generic_to_object(insert,&err);if(!ins||err)return 5;
 BITCODE_HV insHandle=ins->handle.value;
 Dwg_Object_DICTIONARY *ext=dwg_add_DICTIONARY(dwg,NULL,NULL,0);
 Dwg_Object *eo=dwg_obj_generic_to_object(ext,&err);BITCODE_HV eh=eo->handle.value;
 insert->parent->xdicobjhandle=dwg_add_handleref(dwg,3,eh,NULL);insert->parent->is_xdic_missing=0;
 eo->tio.object->ownerhandle=dwg_add_handleref(dwg,5,insHandle,NULL);ext->is_hardowner=1;
 Dwg_Object_DICTIONARY *spatial=dwg_add_DICTIONARY(dwg,NULL,NULL,0);
 Dwg_Object *so=dwg_obj_generic_to_object(spatial,&err);BITCODE_HV sh=so->handle.value;
 so->tio.object->ownerhandle=dwg_add_handleref(dwg,5,eh,NULL);spatial->is_hardowner=1;
 dwg_add_DICTIONARY_item(ext,"ACAD_FILTER",sh);
 int klass=dwg_require_class(dwg,"SPATIAL_FILTER",14);
 dwg_add_object(dwg);Dwg_Object *obj=&dwg->object[dwg->num_objects-1];
 dwg_setup_SPATIAL_FILTER(obj);obj->type=klass;
 dwg_add_handle(&obj->handle,0,dwg_next_handseed(dwg),NULL);
 Dwg_Object_SPATIAL_FILTER *f=obj->tio.object->tio.SPATIAL_FILTER;
 obj->tio.object->ownerhandle=dwg_add_handleref(dwg,5,sh,NULL);obj->tio.object->is_xdic_missing=1;
 dwg_add_DICTIONARY_item(spatial,"SPATIAL",obj->handle.value);
 f->num_clip_verts=!strcmp(argv[2],"triangle")?3:2;
 f->clip_verts=calloc(f->num_clip_verts,sizeof(BITCODE_2RD));
 f->clip_verts[0]=(BITCODE_2RD){1000,2000};
 f->clip_verts[1]=(BITCODE_2RD){7000,8000};
 if(f->num_clip_verts==3){f->clip_verts[1]=(BITCODE_2RD){13000,2000};f->clip_verts[2]=(BITCODE_2RD){1000,8000};}
 f->extrusion=(BITCODE_BE){0,0,1};f->display_boundary_on=strcmp(argv[2],"off")!=0;
 f->inverse_transform=calloc(12,sizeof(double));f->transform=calloc(12,sizeof(double));
 f->inverse_transform[0]=f->inverse_transform[5]=f->inverse_transform[10]=1;
 f->inverse_transform[3]=-1000;f->inverse_transform[7]=-2000;
 f->transform[0]=f->transform[5]=f->transform[10]=1;
 if(!strcmp(argv[2],"inverted")){
  f->clip_verts[1]=(BITCODE_2RD){13000,8000};BITCODE_HV fh=obj->handle.value;
  Dwg_Object_DICTIONARY *xd=dwg_add_DICTIONARY(dwg,NULL,NULL,0);Dwg_Object *xo=dwg_obj_generic_to_object(xd,&err);
  f->parent->xdicobjhandle=dwg_add_handleref(dwg,3,xo->handle.value,NULL);f->parent->is_xdic_missing=0;
  xo->tio.object->ownerhandle=dwg_add_handleref(dwg,5,fh,NULL);xd->is_hardowner=1;
  Dwg_Object_XRECORD *rec=dwg_add_XRECORD(xd,"ACAD_XREC_ROUNDTRIP");
  dwg_add_XRECORD_string(rec,102,strlen("ACAD_INVERTEDCLIP_ROUNDTRIP"),"ACAD_INVERTEDCLIP_ROUNDTRIP");
  BITCODE_3DPOINT pts[4]={{5000,4000,0},{9000,4000,0},{9000,6000,0},{5000,6000,0}};
  for(int i=0;i<4;i++)dwg_add_XRECORD_pointd3d(rec,10,&pts[i]);
 }
 return dwg_write_file(argv[1],dwg)>=128?4:0;
}
